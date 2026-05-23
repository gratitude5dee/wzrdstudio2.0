import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { AudioLines, Pause, Play, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { WizardPanel } from './WizardPanel';
import { WaveformView } from './WaveformView';
import { CLIP_DURATIONS } from './constants';
import type { AudioData, ClipDuration, WizardStep } from './types';

interface AudioPanelProps {
  currentStep: WizardStep;
  audio: AudioData;
  isPlaying: boolean;
  audioReady: boolean;
  /** Clip-relative playhead in seconds (0..selectionDuration). */
  playheadTime: number;
  onAudioSelected: (file: File) => void;
  onDurationChange: (duration: ClipDuration) => void;
  onZoomChange: (zoom: number) => void;
  onSelectionStartChange: (start: number) => void;
  /** Seek the engine to a clip-relative offset within the selection. */
  onSeekClipRelative: (sec: number) => void;
  onTogglePreview: () => void;
  onConfirm: () => void;
  onReset: () => void;
}

const formatTime = (sec: number) => {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = (safe % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
};

export function AudioPanel({
  currentStep,
  audio,
  isPlaying,
  audioReady,
  playheadTime,
  onAudioSelected,
  onDurationChange,
  onZoomChange,
  onSelectionStartChange,
  onSeekClipRelative,
  onTogglePreview,
  onConfirm,
  onReset,
}: AudioPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const showTrimmer = audio.fileName !== null && !audio.confirmed;
  const showConfirmed = audio.confirmed;
  const isActive = currentStep === 1;
  const isComplete = currentStep > 1;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAudioSelected(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) onAudioSelected(file);
  };

  const handleDropzoneKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const totalDuration = Math.max(audio.totalDuration, audio.selectionDuration);
  const selectionStartPct = totalDuration > 0 ? (audio.selectionStart / totalDuration) * 100 : 0;
  const selectionWidthPct = totalDuration > 0 ? (audio.selectionDuration / totalDuration) * 100 : 0;
  const absolutePlayhead = Math.min(
    audio.selectionStart + Math.max(0, playheadTime),
    audio.selectionStart + audio.selectionDuration
  );
  const playheadPct = totalDuration > 0 ? (absolutePlayhead / totalDuration) * 100 : 0;
  const showLivePosition = isPlaying || playheadTime > 0.05;
  const positionLabel = showLivePosition ? absolutePlayhead : audio.selectionStart;

  const handleSelectionPctChange = (pct: number) => {
    const startSec = (pct / 100) * totalDuration;
    onSelectionStartChange(startSec);
  };

  const handleSeekPct = (pct: number) => {
    if (showConfirmed) return;
    const absSec = (pct / 100) * totalDuration;
    const offset = absSec - audio.selectionStart;
    // Only seek when click is inside the selection window; otherwise let the
    // selection-drag handler reposition it.
    if (offset >= 0 && offset <= audio.selectionDuration) {
      onSeekClipRelative(Math.max(0, Math.min(audio.selectionDuration, offset)));
    }
  };

  return (
    <WizardPanel
      stepNumber={1}
      title="Audio"
      subtitle="Upload and trim your clip"
      icon={AudioLines}
      active={isActive}
      complete={isComplete}
    >
      {!showTrimmer && !showConfirmed && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop audio or click to browse"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={handleDropzoneKey}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'flex h-full min-h-[400px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-[#171B24] p-8 text-center transition-all',
            isDragging
              ? 'border-[#f97316] bg-[#f97316]/5 shadow-[0_0_24px_rgba(249,115,22,0.4)]'
              : 'border-white/15 hover:border-[#f97316]/60'
          )}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
            <Upload className="h-7 w-7 text-[#f97316]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Drop audio or click</p>
            <p className="mt-1 text-xs text-slate-500">MP3, WAV, M4A up to 50MB</p>
            <p className="mt-1 text-xs text-slate-500">Minimum 15s, select a 15/30/45/60s clip</p>
          </div>
          <label htmlFor="kanvas-audio-input" className="sr-only">Audio file input</label>
          <input
            id="kanvas-audio-input"
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/flac"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {(showTrimmer || showConfirmed) && (
        <div className="flex h-full flex-col gap-4">
          {/* Preview stage */}
          <div className="relative flex h-44 items-center justify-center rounded-xl bg-black ring-1 ring-white/5">
            <button
              type="button"
              aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
              onClick={onTogglePreview}
              disabled={!audioReady}
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full border border-[#f97316]/40 bg-[#f97316]/10 text-[#fb923c] transition-colors hover:bg-[#f97316]/20',
                !audioReady && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            {!showConfirmed && (
              <button
                type="button"
                aria-label="Reset audio"
                onClick={onReset}
                className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <p className="absolute bottom-3 left-3 max-w-[70%] truncate text-[10px] uppercase tracking-wider text-slate-500">
              {audio.fileName ?? '—'}
            </p>
          </div>

          {!showConfirmed && (
            <div className="rounded-md border border-[#f97316]/15 bg-[#f97316]/[0.04] px-3 py-1.5 text-[11px] text-[#fb923c]/80">
              Drag selection to reposition · Click to seek
            </div>
          )}

          {/* Waveform */}
          <WaveformView
            peaks={audio.peaks}
            showSelection
            selectionStartPercent={selectionStartPct}
            selectionWidthPercent={selectionWidthPct}
            onSelectionStartPercentChange={!showConfirmed ? handleSelectionPctChange : undefined}
            showPlayhead
            playheadPercent={playheadPct}
            onSeekPercent={!showConfirmed ? handleSeekPct : undefined}
            zoom={audio.zoom}
          />

          {/* Position + duration row */}
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className={cn('font-mono', showLivePosition ? 'text-white' : 'text-[#fb923c]')}>
              {formatTime(positionLabel)}
            </span>
            <span className="text-slate-600">/ {formatTime(totalDuration)}</span>
          </div>

          {/* Selection slider (a11y fallback) */}
          {!showConfirmed && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500">
                <span>Position</span>
                <span>Zoom {audio.zoom.toFixed(1)}x</span>
              </div>
              <Slider
                aria-label="Selection start"
                min={0}
                max={Math.max(0, totalDuration - audio.selectionDuration)}
                step={0.1}
                value={[audio.selectionStart]}
                onValueChange={(v) => onSelectionStartChange(v[0] ?? 0)}
                className="mb-3"
              />
              <Slider
                aria-label="Zoom"
                min={1}
                max={4}
                step={0.1}
                value={[audio.zoom]}
                onValueChange={(v) => onZoomChange(v[0] ?? 1)}
              />
            </div>
          )}

          {/* Duration pills */}
          {!showConfirmed && (
            <div className="flex items-center gap-2">
              {CLIP_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onDurationChange(d)}
                  className={cn(
                    'flex-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                    audio.selectionDuration === d
                      ? 'border-[#f97316] bg-[#f97316] text-black shadow-[0_0_18px_rgba(249,115,22,0.4)]'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-[#f97316]/40 hover:text-white'
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onConfirm}
            disabled={showConfirmed || !audioReady}
            className={cn(
              'mt-auto rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-[0.18em] transition-all',
              showConfirmed
                ? 'cursor-default bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40'
                : 'bg-gradient-to-r from-[#f97316] to-[#fb923c] text-black shadow-[0_0_24px_rgba(249,115,22,0.4)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {showConfirmed ? '✓ Selection Confirmed' : 'Confirm Selection'}
          </button>
        </div>
      )}
    </WizardPanel>
  );
}
