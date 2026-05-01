import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pause, Play, Redo2, Scissors, SkipBack, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { WizardPanel } from './WizardPanel';
import { WaveformView } from './WaveformView';
import type { CutMarker, LyricBlock, WizardStep } from './types';

interface MarkersPanelProps {
  currentStep: WizardStep;
  markers: CutMarker[];
  peaks: number[];
  playheadTime: number;
  duration: number;
  isPlaying: boolean;
  zoom: number;
  blocks: LyricBlock[];
  onZoomChange: (z: number) => void;
  onTogglePlay: () => void;
  onAddMarker: () => void;
  onUndoMarkers: () => void;
  onRedoMarkers: () => void;
  onClearMarkers: () => void;
  onDeleteNearestMarker: () => void;
  onSeek: (sec: number) => void;
  onMarkerDrag: (id: string, sec: number) => void;
  onMarkerDelete: (id: string) => void;
  onRestart: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const FLASH_WINDOW_SEC = 0.15;

export function MarkersPanel({
  currentStep,
  markers,
  peaks,
  playheadTime,
  duration,
  isPlaying,
  zoom,
  blocks,
  onZoomChange,
  onTogglePlay,
  onAddMarker,
  onUndoMarkers,
  onRedoMarkers,
  onClearMarkers,
  onDeleteNearestMarker,
  onSeek,
  onMarkerDrag,
  onMarkerDelete,
  onRestart,
  canUndo,
  canRedo,
}: MarkersPanelProps) {
  const disabled = currentStep < 3;
  const isActive = currentStep === 3;

  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (e.key === ' ') { e.preventDefault(); onTogglePlay(); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); onAddMarker(); }
      else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); onUndoMarkers();
      }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); onRedoMarkers();
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); onDeleteNearestMarker();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, onTogglePlay, onAddMarker, onUndoMarkers, onRedoMarkers, onDeleteNearestMarker]);

  const playheadPct = duration > 0 ? (playheadTime / duration) * 100 : 0;

  // CUT/KEEP flash: CUT briefly when within FLASH_WINDOW_SEC of any marker
  const isCutMoment = useMemo(() => {
    if (!isPlaying) return false;
    return markers.some((m) => Math.abs(m.timestamp - playheadTime) <= FLASH_WINDOW_SEC);
  }, [isPlaying, markers, playheadTime]);

  // Active lyric word
  const activeWord = useMemo(() => {
    for (const block of blocks) {
      for (const word of block.words) {
        if (playheadTime >= word.startTime && playheadTime < word.endTime) return word.text;
      }
    }
    return null;
  }, [blocks, playheadTime]);

  const handleSeekPct = (pct: number) => onSeek((pct / 100) * duration);

  return (
    <WizardPanel
      stepNumber={3}
      title="Cut Markers"
      subtitle="Mark the beats"
      icon={Scissors}
      active={isActive}
      complete={false}
      disabled={disabled}
      disabledMessage="Complete lyrics step first"
    >
      <div className="flex h-full flex-col gap-3">
        {/* Large preview stage */}
        <div className={cn(
          'relative flex-1 min-h-[200px] overflow-hidden rounded-xl bg-black ring-1 ring-white/5 transition-colors',
          isCutMoment && 'ring-rose-500/60 bg-rose-950/40'
        )}>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            {isCutMoment ? (
              <span
                className="text-5xl font-black tracking-[0.12em] text-rose-400"
                style={{ textShadow: '0 0 24px rgba(248,113,113,0.85), 0 0 48px rgba(248,113,113,0.55)' }}
              >
                CUT
              </span>
            ) : activeWord ? (
              <span
                className="text-3xl font-black tracking-[0.06em] text-cyan-200 text-center px-4"
                style={{ textShadow: '0 0 20px rgba(34,211,238,0.6)' }}
              >
                {activeWord}
              </span>
            ) : (
              <span
                className="text-5xl font-black tracking-[0.12em] text-yellow-300/80"
                style={{ textShadow: '0 0 24px rgba(253,224,71,0.6)' }}
              >
                KEEP
              </span>
            )}
          </div>

          {/* Skip-to-start button */}
          <button
            type="button"
            aria-label="Skip to start"
            onClick={onRestart}
            className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-slate-300 transition-colors hover:bg-white/10"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <div className="absolute bottom-3 right-3 font-mono text-[10px] text-slate-500">
            {playheadTime.toFixed(1)}s / {duration.toFixed(1)}s
          </div>
        </div>

        {/* Waveform timeline */}
        <WaveformView
          peaks={peaks}
          showSelection
          selectionStartPercent={0}
          selectionWidthPercent={100}
          showPlayhead
          playheadPercent={playheadPct}
          onSeekPercent={handleSeekPct}
          markers={markers}
          duration={duration}
          zoom={zoom}
          onMarkerDrag={onMarkerDrag}
          onMarkerClick={onMarkerDelete}
        />

        {/* Zoom */}
        <div className="flex items-center gap-3 rounded-full border border-cyan-400/20 bg-[#0B0E14] px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Zoom</span>
          <Slider
            aria-label="Zoom"
            min={1}
            max={4}
            step={0.1}
            value={[zoom]}
            onValueChange={(v) => onZoomChange(v[0] ?? 1)}
            className="flex-1"
          />
          <span className="font-mono text-[11px] text-slate-400">{zoom.toFixed(1)}×</span>
        </div>

        {/* Shortcut chips */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <ShortcutChip label="Space" action="play" />
          <ShortcutChip label="M" action="cut" />
          <ShortcutChip label="⌘Z" action="undo" />
          <ShortcutChip label="Del" action="remove" />
        </div>

        {/* Undo/redo + marker count */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Undo"
              onClick={onUndoMarkers}
              disabled={!canUndo}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Redo"
              onClick={onRedoMarkers}
              disabled={!canRedo}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn('text-xs', markers.length === 0 ? 'text-slate-500' : 'text-cyan-300')}>
              {markers.length} marker{markers.length === 1 ? '' : 's'}
            </span>
            {markers.length > 0 && (
              <button
                type="button"
                onClick={onClearMarkers}
                className="text-[11px] text-slate-500 transition-colors hover:text-rose-400"
              >
                clear
              </button>
            )}
          </div>
        </div>
      </div>
    </WizardPanel>
  );
}

function ShortcutChip({ label, action }: { label: string; action: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="inline-flex items-center rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-200 shadow-inner">
        {label}
      </kbd>
      <span>{action}</span>
    </span>
  );
}
