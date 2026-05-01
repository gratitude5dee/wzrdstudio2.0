import { useEffect, useMemo } from 'react';
import { Pause, Play, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { WizardPanel } from './WizardPanel';
import { WaveformView } from './WaveformView';
import type { CutMarker, WizardStep } from './types';

interface MarkersPanelProps {
  currentStep: WizardStep;
  markers: CutMarker[];
  peaks: number[];
  playheadTime: number;
  duration: number;
  isPlaying: boolean;
  zoom: number;
  onZoomChange: (z: number) => void;
  onTogglePlay: () => void;
  onAddMarker: () => void;
  onUndoMarker: () => void;
  onSeek: (sec: number) => void;
  onMarkerDrag: (id: string, sec: number) => void;
  onMarkerDelete: (id: string) => void;
  onPreview: () => void;
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
  onZoomChange,
  onTogglePlay,
  onAddMarker,
  onUndoMarker,
  onSeek,
  onMarkerDrag,
  onMarkerDelete,
  onPreview,
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
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); onUndoMarker();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, onTogglePlay, onAddMarker, onUndoMarker]);

  const playheadPct = duration > 0 ? (playheadTime / duration) * 100 : 0;

  // CUT/KEEP flash: CUT briefly when within FLASH_WINDOW_SEC of any marker
  const isCutMoment = useMemo(() => {
    if (!isPlaying) return false;
    return markers.some((m) => Math.abs(m.timestamp - playheadTime) <= FLASH_WINDOW_SEC);
  }, [isPlaying, markers, playheadTime]);

  const handleSeekPct = (pct: number) => onSeek((pct / 100) * duration);

  return (
    <WizardPanel
      stepNumber={3}
      title="Cut Markers"
      subtitle="Place cut markers"
      icon={Scissors}
      active={isActive}
      complete={false}
      disabled={disabled}
      disabledMessage="Complete lyrics step first"
    >
      <div className="flex h-full flex-col gap-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Place cut markers
        </p>

        {/* Preview */}
        <div className={cn(
          'relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/5 transition-colors',
          isCutMoment && 'ring-rose-500/60 bg-rose-950/40'
        )}>
          <div className="absolute inset-0 flex items-center justify-center">
            {isCutMoment ? (
              <span
                className="text-5xl font-black tracking-[0.12em] text-rose-400"
                style={{ textShadow: '0 0 24px rgba(248,113,113,0.85), 0 0 48px rgba(248,113,113,0.55)' }}
              >
                CUT
              </span>
            ) : (
              <span
                className="text-5xl font-black tracking-[0.12em] text-yellow-300"
                style={{ textShadow: '0 0 24px rgba(253,224,71,0.85), 0 0 48px rgba(253,224,71,0.55)' }}
              >
                KEEP
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlay}
            className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#f97316]/40 bg-[#f97316]/10 text-[#fb923c] backdrop-blur transition-colors hover:bg-[#f97316]/20"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <div className="absolute bottom-3 right-3 font-mono text-[10px] text-slate-500">
            {playheadTime.toFixed(1)}s / {duration.toFixed(1)}s
          </div>
        </div>

        {/* Timeline */}
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
          onMarkerDrag={onMarkerDrag}
          onMarkerClick={onMarkerDelete}
        />

        {/* Zoom */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Zoom</span>
          <Slider
            aria-label="Zoom"
            min={1}
            max={4}
            step={0.1}
            value={[zoom]}
            onValueChange={(v) => onZoomChange(v[0] ?? 1)}
            className="flex-1"
          />
          <span className="font-mono text-[11px] text-slate-400">{zoom.toFixed(1)}x</span>
        </div>

        {/* Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <Kbd>Space</Kbd> play
          <span className="text-slate-700">·</span>
          <Kbd>M</Kbd> cut
          <span className="text-slate-700">·</span>
          <Kbd>⌘Z</Kbd> undo
          <span className="text-slate-700">·</span>
          <span>click marker to delete</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-xs', markers.length === 0 ? 'text-slate-500' : 'text-amber-300')}>
            {markers.length === 0
              ? 'No markers'
              : `${markers.length} marker${markers.length === 1 ? '' : 's'} placed`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onUndoMarker}
              disabled={markers.length === 0}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={onAddMarker}
              className="rounded-full border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#fb923c] transition-colors hover:bg-[#f97316]/20"
            >
              Add Cut
            </button>
            <button
              type="button"
              onClick={onPreview}
              className="rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-black shadow-[0_0_18px_rgba(249,115,22,0.4)] transition-transform hover:brightness-110"
            >
              Preview →
            </button>
          </div>
        </div>
      </div>
    </WizardPanel>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-200 shadow-inner">
      {children}
    </kbd>
  );
}
