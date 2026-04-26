import { Check, AudioLines, Type, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardStep } from './types';

interface KanvasLyricsFooterProps {
  currentStep: WizardStep;
  audioConfirmed: boolean;
  selectionDuration: number;
  wordCount: number;
  markerCount: number;
  onSave: () => void;
}

const STEPS = [
  { id: 1 as WizardStep, label: 'Audio', icon: AudioLines },
  { id: 2 as WizardStep, label: 'Lyrics', icon: Type },
  { id: 3 as WizardStep, label: 'Markers', icon: Scissors },
];

export function KanvasLyricsFooter({
  currentStep,
  audioConfirmed,
  selectionDuration,
  wordCount,
  markerCount,
  onSave,
}: KanvasLyricsFooterProps) {
  const saveEnabled = currentStep === 3;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0D1017]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between gap-6 px-5">
        {/* Stepper */}
        <ol className="flex items-center gap-2">
          {STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            const isLocked = currentStep < step.id;
            const Icon = step.icon;
            return (
              <li key={step.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all',
                    isActive &&
                      'border-[#f97316]/60 bg-[#f97316]/10 text-[#fdba74] shadow-[0_0_18px_rgba(249,115,22,0.4)]',
                    isComplete && 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
                    isLocked && 'border-white/10 bg-white/[0.02] text-slate-600 opacity-60'
                  )}
                >
                  {isComplete ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {step.label}
                  </span>
                </div>
                {step.id !== 3 && (
                  <span
                    className={cn(
                      'h-px w-6',
                      currentStep > step.id ? 'bg-emerald-400/40' : 'bg-white/10'
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Center stats */}
        <div className="hidden items-center gap-4 text-[11px] uppercase tracking-wider text-slate-500 md:flex">
          {audioConfirmed && (
            <>
              <span>
                <span className="text-[#fb923c]">{selectionDuration.toFixed(1)}s</span>
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span>
                <span className="text-[#fb923c]">{wordCount}</span> words
              </span>
              {currentStep === 3 && (
                <>
                  <span className="h-3 w-px bg-white/10" />
                  <span>
                    <span className="text-amber-300">{markerCount}</span> markers
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={onSave}
          disabled={!saveEnabled}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-all',
            saveEnabled
              ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black shadow-[0_0_24px_rgba(249,115,22,0.4)] hover:brightness-110'
              : 'cursor-not-allowed bg-white/5 text-slate-600 ring-1 ring-white/10'
          )}
        >
          Save Template
        </button>
      </div>
    </footer>
  );
}
