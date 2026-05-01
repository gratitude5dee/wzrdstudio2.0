import { useEffect, useMemo } from 'react';
import { Eye, Pause, Play, RotateCcw, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardPanel } from './WizardPanel';
import type { CutMarker, LyricBlock, WizardStep } from './types';

interface VisualizePanelProps {
  currentStep: WizardStep;
  blocks: LyricBlock[];
  markers: CutMarker[];
  playheadTime: number;
  duration: number;
  isPlaying: boolean;
  saving: boolean;
  onTogglePlay: () => void;
  onReplay: () => void;
  onSave: () => void;
}

const FLASH_WINDOW_SEC = 0.18;

function fmt(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function VisualizePanel({
  currentStep,
  blocks,
  markers,
  playheadTime,
  duration,
  isPlaying,
  saving,
  onTogglePlay,
  onReplay,
  onSave,
}: VisualizePanelProps) {
  const isActive = currentStep === 4;

  // Auto-play once when entering step 4
  useEffect(() => {
    if (isActive && !isPlaying && playheadTime < 0.05) {
      const t = window.setTimeout(() => onTogglePlay(), 200);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

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
      // find next upcoming
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

  const isCutMoment = useMemo(() => {
    if (!isPlaying) return false;
    return markers.some((m) => Math.abs(m.timestamp - playheadTime) <= FLASH_WINDOW_SEC);
  }, [isPlaying, markers, playheadTime]);

  const progressPct = duration > 0 ? Math.min(100, (playheadTime / duration) * 100) : 0;

  return (
    <WizardPanel
      stepNumber={4}
      title="Visualize"
      subtitle="Preview your lyric template"
      icon={Eye}
      active={isActive}
      complete={false}
      disabled={!isActive}
      disabledMessage="Finish markers to preview"
    >
      <div className="flex h-full flex-col gap-5">
        {/* 16:9 stage */}
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
                className="text-6xl font-black uppercase tracking-[0.18em] text-rose-300 md:text-8xl"
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
                className="animate-in fade-in zoom-in-95 text-5xl font-black uppercase tracking-[0.08em] text-yellow-300 duration-150 md:text-8xl"
                style={{
                  textShadow:
                    '0 0 24px rgba(253,224,71,0.85), 0 0 60px rgba(253,224,71,0.45)',
                }}
              >
                {activeWord.text}
              </span>
            ) : (
              <span className="text-2xl font-bold uppercase tracking-[0.32em] text-zinc-600">
                {playheadTime < 0.1 ? 'Press play' : '·'}
              </span>
            )}
          </div>

          {/* play button */}
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="absolute bottom-4 left-4 flex h-11 w-11 items-center justify-center rounded-full border border-[#f97316]/40 bg-black/60 text-[#fb923c] backdrop-blur transition-colors hover:bg-[#f97316]/15"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>

          {/* timecode */}
          <div className="absolute bottom-5 right-5 font-mono text-xs text-zinc-400">
            {fmt(playheadTime)} / {fmt(duration)}
          </div>

          {/* marker ticks on bottom edge */}
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

        {/* progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-[#f97316] via-[#fb923c] to-amber-300 transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* caption ribbon */}
        <div className="flex items-center justify-center gap-4 text-center">
          <span className="max-w-[30%] truncate text-xs uppercase tracking-[0.2em] text-zinc-600">
            {prevWord?.text ?? '—'}
          </span>
          <span className="text-sm font-bold uppercase tracking-[0.22em] text-[#fb923c]">
            {activeWord?.text ?? '·'}
          </span>
          <span className="max-w-[30%] truncate text-xs uppercase tracking-[0.2em] text-zinc-600">
            {nextWord?.text ?? '—'}
          </span>
        </div>

        {/* actions */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-200 transition-colors hover:bg-white/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Replay
          </button>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            <span>
              <span className="text-amber-300">{markers.length}</span> cuts
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span>
              <span className="text-[#fb923c]">{blocks.reduce((s, b) => s + b.words.length, 0)}</span> words
            </span>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-black transition-all',
              'bg-gradient-to-r from-cyan-400 to-emerald-400 shadow-[0_0_22px_rgba(52,211,153,0.4)] hover:brightness-110',
              saving && 'cursor-wait opacity-70'
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save Template
          </button>
        </div>
      </div>
    </WizardPanel>
  );
}
