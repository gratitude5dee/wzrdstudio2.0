import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { CutMarker } from './types';

interface WaveformViewProps {
  peaks: number[];
  height?: number;
  className?: string;

  // Selection window (% across the bar)
  showSelection?: boolean;
  selectionStartPercent?: number;
  selectionWidthPercent?: number;
  onSelectionStartPercentChange?: (pct: number) => void; // drag selection (Step 1)

  // Playhead + click-to-seek
  showPlayhead?: boolean;
  playheadPercent?: number;
  onSeekPercent?: (pct: number) => void;

  // Markers
  markers?: CutMarker[];
  duration?: number; // seconds, used to position markers
  onMarkerDrag?: (id: string, newSec: number) => void;
  onMarkerClick?: (id: string) => void;

  /** Horizontal zoom factor (>=1). Centers around selection/playhead. */
  zoom?: number;
}

const FALLBACK_BAR_COUNT = 140;

function fallbackPeaks(): number[] {
  return Array.from({ length: FALLBACK_BAR_COUNT }, (_, i) => {
    const h = Math.sin(i * 0.35) * 0.4 + Math.sin(i * 0.13) * 0.3 + 0.55;
    return Math.max(0.15, Math.min(1, Math.abs(h)));
  });
}

export function WaveformView({
  peaks,
  height = 96,
  className,
  showSelection = false,
  selectionStartPercent = 0,
  selectionWidthPercent = 0,
  onSelectionStartPercentChange,
  showPlayhead = false,
  playheadPercent = 0,
  onSeekPercent,
  markers = [],
  duration = 1,
  onMarkerDrag,
  onMarkerClick,
  zoom = 1,
}: WaveformViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ kind: 'selection' | 'marker'; id?: string; offsetPct: number } | null>(null);

  const bars = peaks.length > 0 ? peaks : fallbackPeaks();

  // Center the zoomed viewport around the selection (Step 1) or playhead.
  const z = Math.max(1, zoom);
  const focusPct = showSelection
    ? selectionStartPercent + selectionWidthPercent / 2
    : playheadPercent;
  const viewportWidthPct = 100 / z;
  let viewportStartPct = focusPct - viewportWidthPct / 2;
  viewportStartPct = Math.max(0, Math.min(100 - viewportWidthPct, viewportStartPct));

  // Map a 0..100 pct relative to the visible viewport to the absolute 0..100
  // pct of the underlying waveform, and vice versa.
  const absFromViewportPct = (vpPct: number) =>
    viewportStartPct + (vpPct / 100) * viewportWidthPct;
  const viewportPctFromAbs = (absPct: number) =>
    ((absPct - viewportStartPct) / viewportWidthPct) * 100;

  const pctFromEvent = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const vpPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return absFromViewportPct(vpPct);
  }, [viewportStartPct, viewportWidthPct]);

  // Global mousemove/up while dragging
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = draggingRef.current;
      if (!drag) return;
      const pct = pctFromEvent(e.clientX) - drag.offsetPct;
      if (drag.kind === 'selection' && onSelectionStartPercentChange) {
        const maxStart = Math.max(0, 100 - selectionWidthPercent);
        onSelectionStartPercentChange(Math.max(0, Math.min(maxStart, pct)));
      } else if (drag.kind === 'marker' && drag.id && onMarkerDrag) {
        const clamped = Math.max(0, Math.min(100, pct + drag.offsetPct));
        onMarkerDrag(drag.id, (clamped / 100) * duration);
      }
    }
    function onUp() {
      draggingRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pctFromEvent, selectionWidthPercent, onSelectionStartPercentChange, onMarkerDrag, duration]);

  const handleBgClick = (e: React.MouseEvent) => {
    if (draggingRef.current) return;
    if (onSeekPercent) onSeekPercent(pctFromEvent(e.clientX));
  };

  const handleSelectionDown = (e: React.MouseEvent) => {
    if (!onSelectionStartPercentChange) return;
    e.stopPropagation();
    const pct = pctFromEvent(e.clientX);
    draggingRef.current = { kind: 'selection', offsetPct: pct - selectionStartPercent };
  };

  // Selection viewport-relative left/width
  const selVpLeft = viewportPctFromAbs(selectionStartPercent);
  const selVpWidth = (selectionWidthPercent / viewportWidthPct) * 100;
  const playheadVp = viewportPctFromAbs(playheadPercent);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleBgClick}
      className={cn(
        'relative w-full select-none overflow-hidden rounded-lg bg-[#0B0E14] cursor-pointer',
        className
      )}
      style={{ height }}
    >
      {/* Bars — scaled by zoom and translated so the viewport shows the focus area */}
      <div
        className="absolute inset-0 flex items-center gap-[2px] px-2 pointer-events-none"
        style={{
          width: `${100 * z}%`,
          transform: `translateX(-${viewportStartPct * z}%)`,
        }}
      >
        {bars.map((h, i) => {
          const pct = (i / bars.length) * 100;
          const inActive =
            showSelection &&
            pct >= selectionStartPercent &&
            pct <= selectionStartPercent + selectionWidthPercent;
          return (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-sm transition-colors',
                inActive ? 'bg-[#f97316]' : 'bg-slate-700/70'
              )}
              style={{ height: `${Math.max(0.1, Math.min(1, h)) * 100}%` }}
            />
          );
        })}
      </div>

      {/* Selection window (draggable in step 1) */}
      {showSelection && selectionWidthPercent > 0 && (
        <div
          onMouseDown={handleSelectionDown}
          className={cn(
            'absolute top-0 bottom-0 rounded-md border border-[#f97316]/70 bg-[#f97316]/10 shadow-[0_0_18px_rgba(249,115,22,0.4)]',
            onSelectionStartPercentChange ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
          )}
          style={{ left: `${selVpLeft}%`, width: `${selVpWidth}%` }}
        />
      )}

      {/* Markers */}
      {markers.map((m) => {
        const absPct = duration > 0 ? Math.min(100, Math.max(0, (m.timestamp / duration) * 100)) : 0;
        const vpPct = viewportPctFromAbs(absPct);
        if (vpPct < -2 || vpPct > 102) return null;
        return (
          <div
            key={m.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (onMarkerDrag) {
                draggingRef.current = { kind: 'marker', id: m.id, offsetPct: pctFromEvent(e.clientX) - absPct };
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!draggingRef.current && onMarkerClick) onMarkerClick(m.id);
            }}
            className={cn(
              'absolute -top-1 -bottom-1 w-[3px] bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.95)] rounded-sm',
              onMarkerDrag ? 'cursor-ew-resize' : 'pointer-events-none'
            )}
            style={{ left: `calc(${vpPct}% - 1.5px)` }}
            title="Drag to move · Click to delete"
          />
        );
      })}

      {/* Playhead */}
      {showPlayhead && playheadVp >= 0 && playheadVp <= 100 && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.85)]"
          style={{ left: `${playheadVp}%` }}
        />
      )}
    </div>
  );
}
