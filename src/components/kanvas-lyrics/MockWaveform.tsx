import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { CutMarker } from './types';

interface MockWaveformProps {
  barCount?: number;
  activeStartPercent?: number;
  activeWidthPercent?: number;
  showSelection?: boolean;
  showPlayhead?: boolean;
  playheadPercent?: number;
  markers?: CutMarker[];
  duration?: number;
  className?: string;
}

export function MockWaveform({
  barCount = 140,
  activeStartPercent = 0,
  activeWidthPercent = 0,
  showSelection = false,
  showPlayhead = false,
  playheadPercent = 0,
  markers = [],
  duration = 1,
  className,
}: MockWaveformProps) {
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      const h = Math.sin(i * 0.35) * 0.4 + Math.sin(i * 0.13) * 0.3 + 0.55;
      return Math.max(0.15, Math.min(1, Math.abs(h)));
    });
  }, [barCount]);

  return (
    <div className={cn('relative h-24 w-full select-none overflow-hidden rounded-lg bg-[#0B0E14]', className)}>
      {/* Bars */}
      <div className="absolute inset-0 flex items-center gap-[2px] px-2">
        {bars.map((h, i) => {
          const pct = (i / barCount) * 100;
          const inActive = pct >= activeStartPercent && pct <= activeStartPercent + activeWidthPercent;
          return (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-sm transition-colors',
                inActive ? 'bg-[#f97316]' : 'bg-slate-700/70'
              )}
              style={{ height: `${h * 100}%` }}
            />
          );
        })}
      </div>

      {/* Selection window */}
      {showSelection && activeWidthPercent > 0 && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 rounded-md border border-[#f97316]/60 bg-[#f97316]/10 shadow-[0_0_18px_rgba(249,115,22,0.4)]"
          style={{
            left: `${activeStartPercent}%`,
            width: `${activeWidthPercent}%`,
          }}
        />
      )}

      {/* Markers */}
      {markers.map((m) => {
        const pct = duration > 0 ? Math.min(100, Math.max(0, (m.timestamp / duration) * 100)) : 0;
        return (
          <div
            key={m.id}
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-amber-300/90 shadow-[0_0_10px_rgba(252,211,77,0.85)]"
            style={{ left: `${pct}%` }}
          />
        );
      })}

      {/* Playhead */}
      {showPlayhead && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
          style={{ left: `${Math.min(100, Math.max(0, playheadPercent))}%` }}
        />
      )}
    </div>
  );
}
