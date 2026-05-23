import React, { useEffect, useMemo, useRef } from 'react';
import { Trash2, Scissors, Copy, SkipBack, Play, Pause, SkipForward, Minus, Plus, Maximize2, Film } from 'lucide-react';
import { Player, PlayerRef } from '@remotion/player';
import { editorTheme, typography, exactMeasurements } from '@/lib/editor/theme';
import { Slider } from '@/components/ui/slider';
import { useThrottle } from '@/hooks/editor/useRenderOptimization';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { EditorComposition } from './remotion/EditorComposition';

interface EditorCanvasProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onDelete?: () => void;
  onSplit?: () => void;
  onClone?: () => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  currentTime,
  duration,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onDelete,
  onSplit,
  onClone,
  zoom = 1,
  onZoomChange,
}) => {
  const throttledZoomChange = useThrottle(onZoomChange || (() => {}), 100);
  const playerRef = useRef<PlayerRef>(null);

  const clips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const composition = useVideoEditorStore((state) => state.composition);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const keyframes = useVideoEditorStore((state) => state.keyframes);
  const seek = useVideoEditorStore((state) => state.seek);

  // Calculate total duration from clips/audio/composition
  const totalDurationMs = useMemo(() => {
    const clipDuration = clips.reduce((max, clip) => {
      const start = clip.startTime ?? 0;
      const end = start + (clip.duration ?? 0);
      return Math.max(max, end);
    }, 0);

    const audioDuration = audioTracks.reduce((max, track) => {
      const start = track.startTime ?? 0;
      const end = start + (track.duration ?? 0);
      return Math.max(max, end);
    }, 0);

    return Math.max(composition.duration, clipDuration, audioDuration, 1000);
  }, [audioTracks, clips, composition.duration]);

  const durationInFrames = useMemo(() => {
    return Math.max(1, Math.ceil((totalDurationMs / 1000) * composition.fps));
  }, [composition.fps, totalDurationMs]);

  // Sync playback state → Remotion player
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isPlaying]);

  // Sync Remotion player frame → store time (during playback)
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const handler = ({ detail }: { detail: { frame: number } }) => {
      const currentTimeMs = (detail.frame / composition.fps) * 1000;
      seek(currentTimeMs);
    };
    player.addEventListener('timeupdate', handler);
    return () => player.removeEventListener('timeupdate', handler);
  }, [composition.fps, seek]);

  // Sync store time → Remotion player seek (when not playing)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || isPlaying) return;
    const desiredFrame = Math.max(0, Math.round((currentTime * composition.fps)));
    const currentFrame = player.getCurrentFrame();
    if (Math.abs(currentFrame - desiredFrame) > 1) {
      player.seekTo(desiredFrame);
    }
  }, [currentTime, composition.fps, isPlaying]);

  const aspectRatioValue = useMemo(() => {
    const [w, h] = composition.aspectRatio.split(':').map(Number);
    return w && h ? `${w} / ${h}` : '16 / 9';
  }, [composition.aspectRatio]);

  const hasContent = clips.length > 0 || audioTracks.length > 0;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const ActionButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
  }> = ({ icon, label, onClick }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 transition-colors rounded"
      style={{
        height: `${exactMeasurements.canvas.buttonHeight}px`,
        border: `1px solid ${editorTheme.border.default}`,
        background: 'transparent',
        color: editorTheme.text.primary,
        fontSize: typography.fontSize.sm,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = editorTheme.bg.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className="flex-1 flex flex-col"
      style={{ background: editorTheme.bg.primary }}
    >
      {/* Canvas Preview Area */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div
          className="relative overflow-hidden shadow-2xl"
          style={{
            width: '100%',
            maxWidth: '884px',
            aspectRatio: aspectRatioValue,
            background: editorTheme.bg.secondary,
            border: `1px solid ${editorTheme.border.subtle}`,
            borderRadius: '8px',
          }}
        >
          {hasContent ? (
            <Player
              ref={playerRef}
              component={EditorComposition as unknown as React.ComponentType<Record<string, unknown>>}
              durationInFrames={durationInFrames}
              fps={composition.fps}
              compositionWidth={composition.width}
              compositionHeight={composition.height}
              inputProps={{
                clips,
                audioTracks,
                composition,
                selectedClipIds,
                keyframes,
              }}
              controls={false}
              spaceKeyToPlayOrPause={false}
              clickToPlay={false}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{
                background: editorTheme.bg.secondary,
                color: editorTheme.text.tertiary,
              }}
            >
              <Film size={48} strokeWidth={1} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: typography.fontSize.md }}>
                Add media to the timeline to preview
              </span>
              <span style={{ fontSize: typography.fontSize.sm, color: editorTheme.text.disabled }}>
                Drag assets from the left panel or use demo content
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div
        className="flex items-center justify-between"
        style={{
          height: `${exactMeasurements.canvas.controlBarHeight}px`,
          background: editorTheme.bg.tertiary,
          borderTop: `1px solid ${editorTheme.border.subtle}`,
          padding: exactMeasurements.canvas.controlBarPadding,
        }}
      >
        {/* Left Actions */}
        <div
          className="flex items-center"
          style={{
            gap: `${exactMeasurements.canvas.buttonGap}px`,
          }}
        >
          <ActionButton
            icon={<Trash2 size={16} />}
            label="Delete"
            onClick={onDelete}
          />
          <ActionButton
            icon={<Scissors size={16} />}
            label="Split"
            onClick={onSplit}
          />
          <ActionButton
            icon={<Copy size={16} />}
            label="Clone"
            onClick={onClone}
          />
        </div>

        {/* Center Playback Controls */}
        <div className="flex items-center gap-3">
          {/* Previous Frame */}
          <button
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: '32px',
              height: '32px',
              color: editorTheme.text.primary,
            }}
            onClick={() => onSeek(Math.max(0, currentTime - 1))}
            onMouseEnter={(e) => e.currentTarget.style.background = editorTheme.bg.hover}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <SkipBack size={20} />
          </button>

          {/* Play/Pause Button */}
          <button
            className="flex items-center justify-center rounded-full transition-all"
            style={{
              width: `${exactMeasurements.canvas.playButtonSize}px`,
              height: `${exactMeasurements.canvas.playButtonSize}px`,
              background: editorTheme.accent.primary,
              color: '#000000',
            }}
            onClick={isPlaying ? onPause : onPlay}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {isPlaying ? <Pause size={20} fill="#000" /> : <Play size={20} fill="#000" />}
          </button>

          {/* Next Frame */}
          <button
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: '32px',
              height: '32px',
              color: editorTheme.text.primary,
            }}
            onClick={() => onSeek(Math.min(duration, currentTime + 1))}
            onMouseEnter={(e) => e.currentTarget.style.background = editorTheme.bg.hover}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <SkipForward size={20} />
          </button>

          {/* Time Display */}
          <div
            className="ml-3"
            style={{
              fontFamily: typography.fontFamily.mono,
              fontSize: exactMeasurements.canvas.timeDisplayFont,
              color: editorTheme.text.secondary,
            }}
          >
            {formatTime(currentTime)} | {formatTime(duration)}
          </div>
        </div>

        {/* Right Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom Out */}
          <button
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: '32px',
              height: '32px',
              color: editorTheme.text.primary,
            }}
            onClick={() => onZoomChange?.(Math.max(0.25, zoom - 0.25))}
            onMouseEnter={(e) => e.currentTarget.style.background = editorTheme.bg.hover}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Minus size={16} />
          </button>

          {/* Zoom Slider */}
          <div style={{ width: '96px' }}>
            <Slider
              value={[zoom]}
              onValueChange={([value]) => onZoomChange?.(value)}
              min={0.25}
              max={2}
              step={0.25}
              className="cursor-pointer"
            />
          </div>

          {/* Zoom In */}
          <button
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: '32px',
              height: '32px',
              color: editorTheme.text.primary,
            }}
            onClick={() => onZoomChange?.(Math.min(2, zoom + 0.25))}
            onMouseEnter={(e) => e.currentTarget.style.background = editorTheme.bg.hover}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Plus size={16} />
          </button>

          {/* Fit to Screen */}
          <button
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: '32px',
              height: '32px',
              color: editorTheme.text.primary,
            }}
            onClick={() => onZoomChange?.(1)}
            onMouseEnter={(e) => e.currentTarget.style.background = editorTheme.bg.hover}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
