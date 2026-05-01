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

const FLASH_WINDOW_SEC = 0.18;

function fmt(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

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
  const progressPct = duration > 0 ? Math.min(100, (playheadTime / duration) * 100) : 0;

  // CUT flash
  const isCutMoment = useMemo(() => {
    if (!isPlaying) return false;
    return markers.some((m) => Math.abs(m.timestamp - playheadTime) <= FLASH_WINDOW_SEC);
  }, [isPlaying, markers, playheadTime]);

  // Active / surrounding words for caption ribbon
  const { activeWord, prevWord, nextWord } = useMemo(() => {
    const flat = blocks.flatMap((b) => b.words);
    let activeIdx = -1;
    for (let i = 0; i < flat.length; i++) {
      const w = flat[i];
      if (playheadTime >= w.startTime && playheadTime < w.endTime) {
        activeIdx = i;
        break;
      }
    }
    if (activeIdx === -1) {
      for (let i = 0; i < flat.length; i++) {
        if (flat[i].startTime > playheadTime) {
          return {
            activeWord: null,
            prevWord: flat[i - 1] ?? null,
            nextWord: flat[i] ?? null,
          };
        }
      }
      return { activeWord: null, prevWord: flat[flat.length - 1] ?? null, nextWord: null };
    }
    return {
      activeWord: flat[activeIdx],
      prevWord: flat[activeIdx - 1] ?? null,
      nextWord: flat[activeIdx + 1] ?? null,
    };
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
        {/* Visualizer stage — 16:9 */}
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 transition-all',
            isCutMoment && 'ring-rose-500/70 bg-rose-950/40 shadow-[0_0_60px_rgba(244,63,94,0.45)]'
          )}
          style={{ aspectRatio: '16 / 9' }}
        >
          {/* gradient backdrop */}
          <div
            aria-hidden
            className={cn(
              'absolute inset-0 transition-opacity',
              isCutMoment
                ? 'bg-gradient-to-br from-rose-900/40 via-black to-black opacity-100'
                : 'bg-gradient-to-br from-[#1a0d04] via-black to-black opacity-100'
            )}
          />

          {/* center word */}
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
            {isCutMoment ? (
              <span
                className="text-5xl font-black uppercase tracking-[0.18em] text-rose-300 md:text-7xl"
                style={{
                  textShadow:
                    '0 0 24px rgba(244,63,94,0.9), 0 0 60px rgba(244,63,94,0.5)',
                }}
              >
                CUT
              </span>
            ) : activeWord ? (
              <span
                key={activeWord.id}
                className="animate-in fade-in zoom-in-95 text-4xl font-black uppercase tracking-[0.08em] text-yellow-300 duration-150 md:text-6xl"
                style={{
                  textShadow:
                    '0 0 24px rgba(253,224,71,0.85), 0 0 60px rgba(253,224,71,0.45)',
                }}
              >
                {activeWord.text}
              </span>
            ) : (
              <span className="text-xl font-bold uppercase tracking-[0.32em] text-zinc-600">
                {playheadTime < 0.1 ? 'Press play' : '·'}
              </span>
            )}
          </div>

          {/* Play/Pause button */}
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#f97316]/40 bg-black/60 text-[#fb923c] backdrop-blur transition-colors hover:bg-[#f97316]/15"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>

          {/* Skip-to-start */}
          <button
            type="button"
            aria-label="Skip to start"
            onClick={onRestart}
            className="absolute bottom-3 left-14 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/60 text-slate-300 backdrop-blur transition-colors hover:bg-white/10"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          {/* Timecode */}
          <div className="absolute bottom-4 right-4 font-mono text-[11px] text-zinc-400">
            {fmt(playheadTime)} / {fmt(duration)}
          </div>

          {/* Marker ticks on bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5">
            {markers.map((m) => (
              <span
                key={m.id}
                className="absolute top-0 h-1.5 w-0.5 bg-rose-400/80"
                style={{ left: `${duration > 0 ? (m.timestamp / duration) * 100 : 0}%` }}
              />
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-[#f97316] via-[#fb923c] to-amber-300 transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Caption ribbon */}
        <div className="flex items-center justify-center gap-4 text-center">
          <span className="max-w-[30%] truncate text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            {prevWord?.text ?? '—'}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#fb923c]">
            {activeWord?.text ?? '·'}
          </span>
          <span className="max-w-[30%] truncate text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            {nextWord?.text ?? '—'}
          </span>
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
