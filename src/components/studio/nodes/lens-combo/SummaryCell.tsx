import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SummaryCellProps {
  label: string;
  /** Set when a value is selected, undefined otherwise. */
  value?: string;
  /** Iconographic glyph rendered at small size on the left. */
  glyph: ReactNode;
  /** Click handler — typically scroll/focus the matching wheel column. */
  onClick?: () => void;
}

/**
 * Compact "Lens Kit Summary" cell used inside the popover header.
 * Shows a 16px glyph + label + value, lighting up orange when populated.
 */
export function SummaryCell({ label, value, glyph, onClick }: SummaryCellProps) {
  const isSet = Boolean(value);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={`${label} — ${value ?? 'not set'}`}
      className={cn(
        'group flex items-center gap-2 px-3 py-2.5 text-left transition-colors',
        'hover:bg-white/[0.025]',
        !isSet && 'opacity-90'
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center transition-opacity',
          isSet ? 'text-[#fdba74] opacity-100' : 'text-zinc-700 opacity-50'
        )}
        aria-hidden
      >
        {glyph}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-500">
          {label}
        </span>
        <span
          className={cn(
            'truncate text-[12px] font-medium transition-colors',
            isSet ? 'text-[#fdba74]' : 'text-zinc-600'
          )}
        >
          {value ?? '—'}
        </span>
      </span>
    </button>
  );
}

export default SummaryCell;
