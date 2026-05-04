import React, { CSSProperties, useCallback, useMemo, useRef } from 'react';
import '@editframe/elements/styles.css';
import {
  Audio,
  Controls,
  Filmstrip,
  FitScale,
  Image as EfImage,
  PanZoom,
  Scrubber,
  Text as EfText,
  TimeDisplay,
  Timegroup,
  TimelineRoot,
  TimelineRuler,
  ToggleLoop,
  TogglePlay,
  TransformHandles,
  TrimHandles,
  Video,
  Workbench,
} from '@editframe/react';
import { Film, Layers, Music, Type } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AudioTrack, Clip, CompositionSettings, LibraryMediaItem, useVideoEditorStore } from '@/store/videoEditorStore';
import { editorTheme, typography } from '@/lib/editor/theme';
import { useDrop } from '@/lib/react-dnd';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ef-canvas': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, any>;
    }
  }
}

interface EditframeWorkbenchCanvasProps {
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
}

const TIMELINE_RULER_HEIGHT = 28;
const VISUAL_TRACK_HEIGHT = 54;
const AUDIO_TRACK_HEIGHT = 42;
const PIXELS_PER_MS = 0.07;

const msToSeconds = (ms: number | null | undefined) => `${Math.max(0, ms ?? 0) / 1000}s`;

const clampDurationMs = (value: number | null | undefined, fallbackSeconds = 5) => {
  if (!Number.isFinite(value ?? NaN) || !value) return fallbackSeconds * 1000;
  return value > 1000 ? Math.max(100, value) : Math.max(100, value * 1000);
};

const getEndTime = (item: { startTime?: number; duration?: number; endTime?: number }) =>
  item.endTime ?? (item.startTime ?? 0) + (item.duration ?? 0);

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

function clipTransformStyle(clip: Clip): CSSProperties {
  const transform = clip.transforms;
  return {
    transform: `translate(${transform.position.x}px, ${transform.position.y}px) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`,
    opacity: transform.opacity,
    filter: buildFilter(clip),
  };
}

function buildFilter(clip: Clip): string | undefined {
  if (!clip.effects?.length) return undefined;
  const factor = (value: number | undefined, fallback: number) =>
    value === undefined ? String(fallback) : value > 10 ? `${value}%` : String(value);
  const parts = clip.effects.flatMap((effect) => {
    const params = effect.params ?? {};
    const name = (effect.id || effect.name || '').toLowerCase();
    if (name === 'blur') return [`blur(${params.amount ?? params.radius ?? 4}px)`];
    if (name === 'brightness') return [`brightness(${factor(params.amount ?? params.value, 1.1)})`];
    if (name === 'contrast') return [`contrast(${factor(params.amount ?? params.value, 1.1)})`];
    if (name === 'saturation') return [`saturate(${factor(params.amount ?? params.value, 1.2)})`];
    if (name === 'grayscale') return [`grayscale(${params.amount ?? params.value ?? 1})`];
    if (name === 'sepia') return [`sepia(${params.amount ?? params.value ?? 1})`];
    if (name === 'invert') return [`invert(${params.amount ?? params.value ?? 1})`];
    return [];
  });
  return parts.length ? parts.join(' ') : undefined;
}

function textStyle(clip: Clip): CSSProperties {
  return {
    ...clipTransformStyle(clip),
    color: clip.style?.color ?? '#ffffff',
    fontFamily: clip.style?.fontFamily ?? 'Inter, sans-serif',
    fontSize: clip.style?.fontSize ?? 72,
    fontWeight: clip.style?.fontWeight ?? 700,
    textAlign: clip.style?.textAlign ?? 'center',
    backgroundColor: clip.style?.backgroundColor ?? 'transparent',
    padding: clip.style?.backgroundColor ? '12px 18px' : 0,
  };
}

function SceneClip({
  clip,
  selected,
  onSelect,
  onTransform,
  onRotate,
}: {
  clip: Clip;
  selected: boolean;
  onSelect: (clipId: string, event?: React.MouseEvent) => void;
  onTransform: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onRotate: (rotation: number) => void;
}) {
  const duration = Math.max(1, clip.duration ?? 5000);
  const sourceIn = clip.trimStart ? msToSeconds(clip.trimStart) : undefined;
  const sourceOut = clip.trimEnd ? msToSeconds(clip.trimEnd) : undefined;
  const baseStyle = clipTransformStyle(clip);
  const selectedBounds = {
    x: 320 + clip.transforms.position.x,
    y: 180 + clip.transforms.position.y,
    width: Math.max(96, 1280 * clip.transforms.scale.x),
    height: Math.max(54, 720 * clip.transforms.scale.y),
    rotation: clip.transforms.rotation,
  };

  return (
    <Timegroup
      id={clip.id}
      mode="fixed"
      offset={msToSeconds(clip.startTime)}
      duration={msToSeconds(duration)}
      className="absolute inset-0 h-full w-full overflow-hidden"
      data-clip-id={clip.id}
      data-element-id={clip.id}
      onClick={(event: React.MouseEvent) => onSelect(clip.id, event)}
      style={{ zIndex: clip.layer ?? 0 }}
    >
      {clip.type === 'text' ? (
        <EfText
          duration={msToSeconds(duration)}
          className="absolute left-1/2 top-1/2 max-w-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap leading-tight"
          style={textStyle(clip)}
        >
          {clip.text || clip.name || 'Text'}
        </EfText>
      ) : clip.type === 'image' ? (
        <EfImage
          src={clip.url}
          duration={msToSeconds(duration)}
          className="absolute inset-0 size-full object-cover"
          style={baseStyle}
        />
      ) : (
        <Video
          src={clip.url}
          sourcein={sourceIn}
          sourceout={sourceOut}
          className="absolute inset-0 size-full object-cover"
          style={baseStyle}
        />
      )}
      {selected ? (
        <TransformHandles
          bounds={selectedBounds}
          enableResize
          enableRotation
          enableDrag
          lockAspectRatio
          onBoundsChange={(event: CustomEvent<{ bounds: { x: number; y: number; width: number; height: number } }>) =>
            onTransform(event.detail.bounds)
          }
          onRotationChange={(event: CustomEvent<{ rotation: number }>) => onRotate(event.detail.rotation)}
        />
      ) : null}
    </Timegroup>
  );
}

function AudioLayer({ track }: { track: AudioTrack }) {
  const duration = Math.max(1, track.duration ?? 5000);

  return (
    <Timegroup mode="fixed" offset={msToSeconds(track.startTime)} duration={msToSeconds(duration)} data-audio-id={track.id}>
      <Audio
        src={track.url}
        volume={track.isMuted ? 0 : track.volume ?? 1}
        sourcein={track.fadeInDuration ? msToSeconds(track.fadeInDuration) : undefined}
      />
    </Timegroup>
  );
}

function buildTimelineComponent(
  compositionId: string,
  clips: Clip[],
  audioTracks: AudioTrack[],
  composition: CompositionSettings,
  selectedClipIds: string[],
  onSelectClip: (clipId: string, event?: React.MouseEvent) => void,
  onTransformClip: (clip: Clip, bounds: { x: number; y: number; width: number; height: number }) => void,
  onRotateClip: (clip: Clip, rotation: number) => void
) {
  return function EditframeTimeline() {
    const sortedClips = [...clips].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || (a.startTime ?? 0) - (b.startTime ?? 0));

    return (
      <Timegroup
        id={compositionId}
        mode="contain"
        duration={msToSeconds(composition.duration || 5000)}
        fps={composition.fps}
        className="relative overflow-hidden"
        style={{
          width: composition.width,
          height: composition.height,
          background: composition.backgroundColor || '#000',
        }}
      >
        {sortedClips.length === 0 ? (
          <Timegroup mode="fixed" duration="5s" className="absolute inset-0 h-full w-full bg-black" />
        ) : null}
        {sortedClips.map((clip) => (
          <SceneClip
            key={clip.id}
            clip={clip}
            selected={selectedClipIds.includes(clip.id)}
            onSelect={onSelectClip}
            onTransform={(bounds) => onTransformClip(clip, bounds)}
            onRotate={(rotation) => onRotateClip(clip, rotation)}
          />
        ))}
        {audioTracks.map((track) => (
          <AudioLayer key={track.id} track={track} />
        ))}
      </Timegroup>
    );
  };
}

export function EditframeWorkbenchCanvas({
  clips,
  audioTracks,
  composition,
}: EditframeWorkbenchCanvasProps) {
  const compositionId = 'wzrd-editor-composition';
  const canvasId = 'wzrd-editor-canvas';
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const canvasDropRef = useRef<HTMLDivElement | null>(null);
  const addClip = useVideoEditorStore((state) => state.addClip);
  const addAudioTrack = useVideoEditorStore((state) => state.addAudioTrack);
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const selectClip = useVideoEditorStore((state) => state.selectClip);
  const selectAudioTrack = useVideoEditorStore((state) => state.selectAudioTrack);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const playback = useVideoEditorStore((state) => state.playback);

  const compositionDuration = useMemo(() => {
    const visualEnd = clips.reduce((cursor, clip) => Math.max(cursor, getEndTime(clip)), 0);
    const audioEnd = audioTracks.reduce((cursor, track) => Math.max(cursor, getEndTime(track)), 0);
    return Math.max(composition.duration || 0, visualEnd, audioEnd, 5000);
  }, [audioTracks, clips, composition.duration]);

  const appendMedia = useCallback(
    (item: LibraryMediaItem, options?: { startTime?: number; layer?: number; position?: { x: number; y: number } }) => {
      if (!item.url) return;
      const durationMs = clampDurationMs(item.durationSeconds, item.mediaType === 'image' ? 5 : 6);
      const startTime = options?.startTime ?? (item.mediaType === 'audio'
        ? audioTracks.reduce((cursor, track) => Math.max(cursor, getEndTime(track)), 0)
        : clips.reduce((cursor, clip) => Math.max(cursor, getEndTime(clip)), 0));

      if (item.mediaType === 'audio') {
        const track: AudioTrack = {
          id: uuidv4(),
          mediaItemId: item.id,
          type: 'audio',
          name: item.name,
          url: item.url,
          startTime,
          duration: durationMs,
          endTime: startTime + durationMs,
          volume: 1,
          isMuted: false,
          trackIndex: options?.layer ?? 0,
          fadeInDuration: 0,
          fadeOutDuration: 0,
        };
        addAudioTrack(track);
        selectAudioTrack(track.id);
        return;
      }

      const clip: Clip = {
        id: uuidv4(),
        mediaItemId: item.id,
        type: item.mediaType === 'image' ? 'image' : 'video',
        name: item.name,
        url: item.url,
        startTime,
        duration: durationMs,
        endTime: startTime + durationMs,
        trackIndex: options?.layer ?? 0,
        layer: options?.layer ?? 0,
        transforms: {
          position: options?.position ?? { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          opacity: 1,
        },
      };
      addClip(clip);
      selectClip(clip.id);
    },
    [addAudioTrack, addClip, audioTracks, clips, selectAudioTrack, selectClip]
  );

  const handleSelectClip = useCallback(
    (clipId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      selectClip(clipId, event?.shiftKey);
    },
    [selectClip]
  );

  const handleTransformClip = useCallback(
    (clip: Clip, bounds: { x: number; y: number; width: number; height: number }) => {
      updateClip(
        clip.id,
        {
          transforms: {
            ...clip.transforms,
            position: {
              x: bounds.x - 320,
              y: bounds.y - 180,
            },
            scale: {
              x: Math.max(0.05, bounds.width / 1280),
              y: Math.max(0.05, bounds.height / 720),
            },
          },
        },
        { skipHistory: true }
      );
    },
    [updateClip]
  );

  const handleRotateClip = useCallback(
    (clip: Clip, rotation: number) => {
      updateClip(clip.id, { transforms: { ...clip.transforms, rotation } }, { skipHistory: true });
    },
    [updateClip]
  );

  const TimelineComponent = useMemo(
    () =>
      buildTimelineComponent(
        compositionId,
        clips,
        audioTracks,
        { ...composition, duration: compositionDuration },
        selectedClipIds,
        handleSelectClip,
        handleTransformClip,
        handleRotateClip
      ),
    [audioTracks, clips, composition, compositionDuration, handleRotateClip, handleSelectClip, handleTransformClip, selectedClipIds]
  );

  const [{ isOver: isOverTimeline }, attachTimelineDrop] = useDrop<{ mediaItem: LibraryMediaItem }>({
    accept: 'MEDIA_ITEM',
    drop: (dragItem, monitor) => {
      const offset = monitor.getClientOffset();
      const rect = timelineRef.current?.getBoundingClientRect();
      const mediaItem = dragItem?.mediaItem;
      if (!offset || !rect || !mediaItem) return;
      const x = Math.max(0, offset.x - rect.left + (timelineRef.current?.scrollLeft ?? 0));
      const y = Math.max(0, offset.y - rect.top - TIMELINE_RULER_HEIGHT);
      const startTime = Math.round((x / PIXELS_PER_MS) / 100) * 100;
      const layer = mediaItem.mediaType === 'audio'
        ? Math.max(0, Math.floor((y - VISUAL_TRACK_HEIGHT * 3) / AUDIO_TRACK_HEIGHT))
        : Math.max(0, Math.floor(y / VISUAL_TRACK_HEIGHT));
      appendMedia(mediaItem, { startTime, layer });
    },
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  });

  const [{ isOver: isOverCanvas }, attachCanvasDrop] = useDrop<{ mediaItem: LibraryMediaItem }>({
    accept: 'MEDIA_ITEM',
    drop: (dragItem, monitor) => {
      const offset = monitor.getClientOffset();
      const rect = canvasDropRef.current?.getBoundingClientRect();
      const mediaItem = dragItem?.mediaItem;
      if (!offset || !rect || !mediaItem) return;
      const relativeX = ((offset.x - rect.left) / Math.max(1, rect.width) - 0.5) * composition.width;
      const relativeY = ((offset.y - rect.top) / Math.max(1, rect.height) - 0.5) * composition.height;
      appendMedia(mediaItem, {
        startTime: playback.currentTime,
        layer: mediaItem.mediaType === 'audio' ? 0 : Math.max(0, clips.length),
        position: { x: Math.round(relativeX), y: Math.round(relativeY) },
      });
    },
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  });

  const setTimelineDropRef = useCallback(
    (node: HTMLDivElement | null) => {
      timelineRef.current = node;
      attachTimelineDrop(node);
    },
    [attachTimelineDrop]
  );

  const setCanvasDropRef = useCallback(
    (node: HTMLDivElement | null) => {
      canvasDropRef.current = node;
      attachCanvasDrop(node);
    },
    [attachCanvasDrop]
  );

  const hasContent = clips.length > 0 || audioTracks.length > 0;
  const visualLayers = useMemo(() => {
    const maxLayer = clips.reduce((max, clip) => Math.max(max, clip.layer ?? 0), 0);
    return Array.from({ length: Math.max(3, maxLayer + 1) }, (_, index) => index);
  }, [clips]);
  const audioLayers = useMemo(() => {
    const maxLayer = audioTracks.reduce((max, track) => Math.max(max, track.trackIndex ?? 0), 0);
    return Array.from({ length: Math.max(2, maxLayer + 1) }, (_, index) => index);
  }, [audioTracks]);

  if (!hasContent) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: editorTheme.bg.primary }}>
        <div className="flex flex-1 items-center justify-center p-8">
          <div
            className="flex aspect-video w-full max-w-[884px] flex-col items-center justify-center gap-3 rounded-lg border"
            style={{
              background: editorTheme.bg.secondary,
              borderColor: editorTheme.border.subtle,
              color: editorTheme.text.tertiary,
            }}
          >
            <Film size={48} strokeWidth={1} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: typography.fontSize.md }}>Add media to the timeline to preview</span>
            <span style={{ fontSize: typography.fontSize.sm, color: editorTheme.text.disabled }}>
              Click an asset, drag to canvas, or drag to a timeline track
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: editorTheme.bg.primary }}>
      <Workbench className="h-full w-full min-h-0">
        <PanZoom slot="canvas" className="relative flex h-full w-full items-center justify-center bg-black/80">
          <FitScale className="h-full w-full">
            <div
              ref={setCanvasDropRef}
              className={`relative flex h-full w-full items-center justify-center ${isOverCanvas ? 'ring-2 ring-orange-400' : ''}`}
              onClick={() => useVideoEditorStore.getState().clearClipSelection()}
            >
              <ef-canvas
                id={canvasId}
                element-id-attribute="data-element-id"
                enable-transform-handles="true"
                className="block"
              >
                <TimelineRoot id={compositionId} component={TimelineComponent} />
              </ef-canvas>
            </div>
          </FitScale>
        </PanZoom>

        <div slot="timeline" className="flex h-full min-h-[250px] flex-col border-t border-white/10 bg-[#101010]">
          <Controls target={compositionId} className="flex items-center gap-3 border-b border-white/10 px-3 py-2 text-xs text-zinc-200">
            <TogglePlay className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-white/10 bg-white text-black" />
            <TimeDisplay className="min-w-[96px] text-zinc-300" />
            <Scrubber className="flex-1" />
            <ToggleLoop className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-white/10 text-zinc-300" />
          </Controls>

          <div className="grid min-h-0 flex-1 grid-cols-[168px_1fr]">
            <div className="border-r border-white/10 bg-black/20 text-xs text-zinc-400">
              <div className="flex h-7 items-center px-3 text-[11px] uppercase tracking-wide text-zinc-500">Layers</div>
              {visualLayers.map((layer) => (
                <div key={`visual-label-${layer}`} className="flex items-center gap-2 border-t border-white/5 px-3" style={{ height: VISUAL_TRACK_HEIGHT }}>
                  <Layers size={14} />
                  <span>Visual {layer + 1}</span>
                </div>
              ))}
              {audioLayers.map((layer) => (
                <div key={`audio-label-${layer}`} className="flex items-center gap-2 border-t border-white/5 px-3" style={{ height: AUDIO_TRACK_HEIGHT }}>
                  <Music size={14} />
                  <span>Audio {layer + 1}</span>
                </div>
              ))}
            </div>

            <div
              ref={setTimelineDropRef}
              className={`relative min-h-0 overflow-auto ${isOverTimeline ? 'bg-orange-500/10' : ''}`}
            >
              <div style={{ width: Math.max(920, compositionDuration * PIXELS_PER_MS), minHeight: 28 + visualLayers.length * VISUAL_TRACK_HEIGHT + audioLayers.length * AUDIO_TRACK_HEIGHT }}>
                <TimelineRuler durationMs={compositionDuration} fps={composition.fps} zoomScale={1} containerWidth={Math.max(920, compositionDuration * PIXELS_PER_MS)} />

                <div className="relative">
                  {visualLayers.map((layer) => (
                    <div key={`visual-${layer}`} className="relative border-t border-white/5" style={{ height: VISUAL_TRACK_HEIGHT }}>
                      {clips.filter((clip) => (clip.layer ?? 0) === layer).map((clip) => {
                        const selected = selectedClipIds.includes(clip.id);
                        return (
                          <button
                            key={clip.id}
                            type="button"
                            className="absolute top-2 flex h-10 items-center gap-2 overflow-hidden rounded border px-2 text-left text-xs transition"
                            style={{
                              left: (clip.startTime ?? 0) * PIXELS_PER_MS,
                              width: Math.max(54, (clip.duration ?? 1000) * PIXELS_PER_MS),
                              borderColor: selected ? editorTheme.accent.primary : 'rgba(255,255,255,.12)',
                              background: selected ? 'rgba(255,107,74,.25)' : 'rgba(255,255,255,.08)',
                              color: editorTheme.text.primary,
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              selectClip(clip.id, event.shiftKey);
                            }}
                          >
                            {clip.type === 'text' ? <Type size={14} /> : clip.type === 'image' ? <Film size={14} /> : <Film size={14} />}
                            <span className="truncate">{clip.name}</span>
                            <span className="ml-auto text-[10px] text-zinc-400">{formatTime(clip.duration ?? 0)}</span>
                            <TrimHandles
                              mode="standalone"
                              elementId={clip.id}
                              pixelsPerMs={PIXELS_PER_MS}
                              value={{ startMs: clip.startTime ?? 0, endMs: getEndTime(clip) }}
                              intrinsicDurationMs={(clip.trimEnd ?? clip.duration ?? 0) + (clip.trimStart ?? 0)}
                              onTrimChangeEnd={(event: CustomEvent<{ value: { startMs: number; endMs: number } }>) => {
                                event.stopPropagation();
                                const startTime = Math.max(0, event.detail.value.startMs);
                                const endTime = Math.max(startTime + 100, event.detail.value.endMs);
                                updateClip(clip.id, {
                                  startTime,
                                  duration: endTime - startTime,
                                  endTime,
                                });
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {audioLayers.map((layer) => (
                    <div key={`audio-${layer}`} className="relative border-t border-white/5" style={{ height: AUDIO_TRACK_HEIGHT }}>
                      {audioTracks.filter((track) => (track.trackIndex ?? 0) === layer).map((track) => (
                        <button
                          key={track.id}
                          type="button"
                          className="absolute top-2 flex h-7 items-center gap-2 overflow-hidden rounded border border-emerald-400/30 bg-emerald-400/10 px-2 text-left text-xs text-emerald-50"
                          style={{
                            left: (track.startTime ?? 0) * PIXELS_PER_MS,
                            width: Math.max(54, (track.duration ?? 1000) * PIXELS_PER_MS),
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectAudioTrack(track.id, event.shiftKey);
                          }}
                        >
                          <Music size={13} />
                          <span className="truncate">{track.name}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                <Filmstrip target={compositionId} pixelsPerMs={PIXELS_PER_MS} className="h-12 border-t border-white/10" />
              </div>
            </div>
          </div>
        </div>
      </Workbench>
    </div>
  );
}

export default EditframeWorkbenchCanvas;
