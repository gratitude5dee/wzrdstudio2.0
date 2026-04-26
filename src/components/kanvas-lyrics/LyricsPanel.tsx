import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Pause, Play, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardPanel } from './WizardPanel';
import type { LyricBlock, TranscribeStatus, WizardStep } from './types';

interface LyricsPanelProps {
  currentStep: WizardStep;
  blocks: LyricBlock[];
  activeWordId: string | null;
  isPlaying: boolean;
  playheadTime: number;
  duration: number;
  transcribeStatus: TranscribeStatus;
  onTogglePlay: () => void;
  onWordChange: (blockId: string, wordId: string, text: string) => void;
  onDone: () => void;
  onRetryTranscribe: () => void;
  onManualEntry: () => void;
}

const formatTime = (sec: number) => {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const STATUS_LABEL: Record<TranscribeStatus, string> = {
  idle: 'Waiting for audio…',
  uploading: 'Uploading audio…',
  transcribing: 'Transcribing with Gemini 3.1 Flash…',
  parsing: 'Aligning lyrics to beats…',
  ready: 'Ready',
  failed: 'Transcription failed',
};

const STATUS_PROGRESS: Record<TranscribeStatus, number> = {
  idle: 5,
  uploading: 25,
  transcribing: 60,
  parsing: 90,
  ready: 100,
  failed: 100,
};

export function LyricsPanel({
  currentStep,
  blocks,
  activeWordId,
  isPlaying,
  playheadTime,
  duration,
  transcribeStatus,
  onTogglePlay,
  onWordChange,
  onDone,
  onRetryTranscribe,
  onManualEntry,
}: LyricsPanelProps) {
  const disabled = currentStep < 2;
  const isActive = currentStep === 2;
  const isComplete = currentStep > 2;

  const wordCount = blocks.reduce((sum, b) => sum + b.words.length, 0);
  const blockCount = blocks.length;

  const isProcessing =
    transcribeStatus === 'uploading' ||
    transcribeStatus === 'transcribing' ||
    transcribeStatus === 'parsing';

  return (
    <WizardPanel
      stepNumber={2}
      title="Lyrics"
      subtitle="AI transcription — any language"
      icon={Type}
      active={isActive}
      complete={isComplete}
      disabled={disabled}
      disabledMessage="Complete audio step first"
    >
      <div className="flex h-full flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-white">Edit Lyrics</p>
          {!isProcessing && transcribeStatus !== 'failed' && (
            <p className="text-[11px] text-slate-500">
              {wordCount} words • {blockCount} block{blockCount === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {/* Processing skeleton */}
        {isProcessing && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl bg-[#0F1116] p-6 ring-1 ring-white/5">
            <div className="flex h-16 w-24 items-end gap-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-[#f97316] to-[#fb923c] animate-pulse"
                  style={{
                    height: `${30 + Math.abs(Math.sin(i * 0.7)) * 70}%`,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              ))}
            </div>
            <p className="text-sm font-semibold text-white">Preparing your lyrics…</p>
            <div className="w-full max-w-xs">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500">
                <span>Progress</span>
                <span className="text-[#fb923c]">{STATUS_PROGRESS[transcribeStatus]}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full bg-gradient-to-r from-[#f97316] to-[#fb923c] transition-[width] duration-500"
                  style={{ width: `${STATUS_PROGRESS[transcribeStatus]}%` }}
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-500">
                {STATUS_LABEL[transcribeStatus]}
              </p>
            </div>
            <button
              type="button"
              onClick={onManualEntry}
              className="text-[11px] text-slate-500 underline-offset-2 transition-colors hover:text-[#fb923c] hover:underline"
            >
              Type lyrics manually instead
            </button>
          </div>
        )}

        {/* Failure state */}
        {transcribeStatus === 'failed' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-[#0F1116] p-6 ring-1 ring-rose-500/20">
            <p className="text-sm font-semibold text-rose-300">Transcription failed</p>
            <p className="max-w-xs text-center text-[11px] text-slate-500">
              Gemini couldn't process this clip. Try again, or type the lyrics manually.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRetryTranscribe}
                className="rounded-full border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#fb923c] hover:bg-[#f97316]/20"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onManualEntry}
                className="rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300 hover:bg-white/10"
              >
                Manual entry
              </button>
            </div>
          </div>
        )}

        {/* Ready: editor */}
        {!isProcessing && transcribeStatus !== 'failed' && (
          <>
            <div className="rounded-md border border-[#f97316]/15 bg-[#f97316]/[0.04] px-3 py-2 text-[11px] text-[#fb923c]/85">
              Perfect once — saved for all future generations
            </div>

            {/* Mini player */}
            <div className="flex items-center gap-3 rounded-xl bg-[#171B24] p-3 ring-1 ring-white/5">
              <button
                type="button"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={onTogglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#f97316]/40 bg-[#f97316]/10 text-[#fb923c] transition-colors hover:bg-[#f97316]/20"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <div className="flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-[#f97316] to-[#fb923c] transition-[width]"
                    style={{
                      width: `${duration > 0 ? Math.min(100, (playheadTime / duration) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                {formatTime(playheadTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Block editor */}
            <div className="flex-1 space-y-3 overflow-y-auto">
              {blocks.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm font-semibold text-slate-300">No lyrics yet</p>
                  <p className="max-w-xs text-[11px] text-slate-500">
                    Click below to add a block and start typing.
                  </p>
                  <button
                    type="button"
                    onClick={onManualEntry}
                    className="mt-2 rounded-full border border-[#f97316]/40 bg-[#f97316]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#fb923c]"
                  >
                    Add block
                  </button>
                </div>
              ) : (
                blocks.map((block, i) => (
                  <div key={block.id} className="rounded-xl bg-[#171B24] p-3 ring-1 ring-white/5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                        BLOCK {i + 1}
                      </span>
                      <span className="font-mono text-[10px] text-slate-600">
                        {block.startTime.toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {block.words.map((word) => (
                        <WordPill
                          key={word.id}
                          text={word.text}
                          isActive={activeWordId === word.id}
                          onCommit={(next) => onWordChange(block.id, word.id, next)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onRetryTranscribe}
                  className="rounded-md px-2 py-1 text-[10px] text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
                >
                  Re-transcribe
                </button>
              </div>
              <button
                type="button"
                onClick={onDone}
                disabled={blocks.length === 0}
                className="rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black shadow-[0_0_18px_rgba(249,115,22,0.4)] transition-transform hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </WizardPanel>
  );
}

interface WordPillProps {
  text: string;
  isActive: boolean;
  onCommit: (next: string) => void;
}

function WordPill({ text, isActive, onCommit }: WordPillProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(text), [text]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== text) onCommit(next);
    else setDraft(text);
    setEditing(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); setDraft(text); setEditing(false); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        size={Math.max(draft.length, 3)}
        className="rounded-md border border-[#f97316] bg-[#f97316]/10 px-2 py-1 text-sm text-[#fdba74] outline-none ring-2 ring-[#f97316]/40"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'rounded-md border px-2 py-1 text-sm transition-all',
        isActive
          ? 'border-[#f97316] bg-[#f97316]/10 text-[#fdba74] shadow-[0_0_14px_rgba(249,115,22,0.4)]'
          : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-[#f97316]/40 hover:text-white'
      )}
    >
      {text}
    </button>
  );
}
