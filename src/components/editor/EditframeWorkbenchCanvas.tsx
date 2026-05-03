import React, { CSSProperties, useMemo } from 'react';
import {
  Audio,
  Controls,
  Filmstrip,
  FitScale,
  Image as EfImage,
  PanZoom,
  Scrubber,
  TimeDisplay,
  Timegroup,
  TimelineRoot,
  ToggleLoop,
  TogglePlay,
  Video,
  Workbench,
} from '@editframe/react';
import { Film } from 'lucide-react';
import { Clip, AudioTrack, CompositionSettings } from '@/store/videoEditorStore';
import { editorTheme, typography } from '@/lib/editor/theme';

interface EditframeWorkbenchCanvasProps {
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
}

const msToSeconds = (ms: number | null | undefined) => `${Math.max(0, ms ?? 0) / 1000}s`;

function clipTransformStyle(clip: Clip): CSSProperties {
  const transform = clip.transforms;
  return {
    transform: `translate(${transform.position.x}px, ${transform.position.y}px) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`,
    opacity: transform.opacity,
  };
}

function SceneClip({ clip }: { clip: Clip }) {
  const duration = Math.max(1, clip.duration ?? 5000);
  const sourceIn = clip.trimStart ? msToSeconds(clip.trimStart) : undefined;
  const sourceOut = clip.trimEnd ? msToSeconds(clip.trimEnd) : undefined;
  const style = clipTransformStyle(clip);

  return (
    <Timegroup
      mode="fixed"
      duration={msToSeconds(duration)}
      className="absolute inset-0 h-full w-full overflow-hidden bg-black"
      data-clip-id={clip.id}
    >
      {clip.type === 'image' ? (
        <EfImage
          src={clip.url}
          duration={msToSeconds(duration)}
          className="absolute inset-0 size-full object-cover"
          style={style}
          alt={clip.name}
        />
      ) : (
        <Video
          src={clip.url}
          sourceIn={sourceIn}
          sourceOut={sourceOut}
          className="absolute inset-0 size-full object-cover"
          style={style}
        />
      )}
    </Timegroup>
  );
}

function VisualSequence({ clips }: { clips: Clip[] }) {
  const sorted = [...clips].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  let cursor = 0;
  const items: React.ReactNode[] = [];

  sorted.forEach((clip) => {
    const start = Math.max(0, clip.startTime ?? cursor);
    if (start > cursor) {
      items.push(
        <Timegroup
          key={`gap-${clip.id}`}
          mode="fixed"
          duration={msToSeconds(start - cursor)}
          className="absolute inset-0 h-full w-full bg-black"
        />
      );
    }
    items.push(<SceneClip key={clip.id} clip={clip} />);
    cursor = Math.max(cursor, start + Math.max(1, clip.duration ?? 5000));
  });

  if (items.length === 0) {
    items.push(
      <Timegroup key="empty" mode="fixed" duration="5s" className="absolute inset-0 h-full w-full bg-black" />
    );
  }

  return (
    <Timegroup mode="sequence" className="absolute inset-0 h-full w-full">
      {items}
    </Timegroup>
  );
}

function AudioLayer({ track }: { track: AudioTrack }) {
  const start = Math.max(0, track.startTime ?? 0);
  const duration = Math.max(1, track.duration ?? 5000);

  return (
    <Timegroup mode="sequence" data-audio-id={track.id}>
      {start > 0 ? <Timegroup mode="fixed" duration={msToSeconds(start)} /> : null}
      <Timegroup mode="fixed" duration={msToSeconds(duration)}>
        <Audio src={track.url} volume={track.isMuted ? 0 : track.volume ?? 1} />
      </Timegroup>
    </Timegroup>
  );
}

function buildTimelineComponent(
  compositionId: string,
  clips: Clip[],
  audioTracks: AudioTrack[],
  composition: CompositionSettings
) {
  return function EditframeTimeline() {
    return (
      <Timegroup
        id={compositionId}
        mode="contain"
        fps={composition.fps}
        className="relative overflow-hidden bg-black"
        style={{
          width: composition.width,
          height: composition.height,
          background: composition.backgroundColor || '#000',
        }}
      >
        <VisualSequence clips={clips} />
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
  const TimelineComponent = useMemo(
    () => buildTimelineComponent(compositionId, clips, audioTracks, composition),
    [audioTracks, clips, composition]
  );
  const hasContent = clips.length > 0 || audioTracks.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: editorTheme.bg.primary }}>
      {hasContent ? (
        <Workbench className="h-full w-full min-h-0">
          <PanZoom slot="canvas" className="flex h-full w-full items-center justify-center bg-black/80">
            <FitScale className="h-full w-full">
              <TimelineRoot id={compositionId} component={TimelineComponent} />
            </FitScale>
          </PanZoom>

          <div slot="timeline" className="flex h-full min-h-[180px] flex-col border-t border-white/10 bg-[#101010]">
            <Controls target={compositionId} className="flex items-center gap-3 border-b border-white/10 px-3 py-2 text-xs text-zinc-200">
              <TogglePlay className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-white/10 bg-white text-black" />
              <TimeDisplay className="min-w-[96px] text-zinc-300" />
              <Scrubber className="flex-1" />
              <ToggleLoop className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-white/10 text-zinc-300" />
            </Controls>
            <Filmstrip target={compositionId} pixelsPerMs={0.08} className="min-h-0 flex-1" />
          </div>
        </Workbench>
      ) : (
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
              Drag assets from the left panel or use demo content
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default EditframeWorkbenchCanvas;
