import type { ReactNode, ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { Check, Lock } from 'lucide-react';

interface WizardPanelProps {
  stepNumber: 1 | 2 | 3;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  complete: boolean;
  disabled?: boolean;
  disabledMessage?: string;
  children: ReactNode;
}

export function WizardPanel({
  stepNumber,
  title,
  subtitle,
  icon: Icon,
  active,
  complete,
  disabled = false,
  disabledMessage,
  children,
}: WizardPanelProps) {
  return (
    <section
      aria-disabled={disabled}
      className={cn(
        'relative flex min-h-[580px] flex-col rounded-2xl border bg-[#11131A] p-5 transition-all duration-300',
        active && 'border-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.32)]',
        complete && !active && 'border-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.12)]',
        !active && !complete && 'border-white/10',
        disabled && 'opacity-60'
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              complete && 'bg-emerald-400 text-black',
              active && !complete && 'bg-cyan-300 text-black',
              !active && !complete && 'bg-white/5 text-slate-400 ring-1 ring-white/10'
            )}
          >
            {complete ? <Check className="h-3.5 w-3.5" /> : stepNumber}
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <Icon
          className={cn(
            'h-5 w-5 shrink-0',
            active ? 'text-cyan-300' : complete ? 'text-emerald-400' : 'text-slate-600'
          )}
        />
      </header>

      <div className={cn('relative flex-1', disabled && 'pointer-events-none select-none')}>
        {children}
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[#11131A]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                <Lock className="h-4 w-4 text-slate-500" />
              </div>
              <p className="max-w-[220px] text-xs text-slate-500">
                {disabledMessage ?? 'Locked'}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
