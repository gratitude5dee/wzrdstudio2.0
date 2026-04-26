import { FormEvent } from 'react';
import { ArrowUp, Plus, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloraPromptBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function FloraPromptBar({
  value,
  onChange,
  onSubmit,
  isSubmitting = false,
  disabled = false,
  placeholder = 'Describe what you want to create...',
}: FloraPromptBarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isSubmitting || value.trim().length === 0) {
      return;
    }
    onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute bottom-6 left-1/2 z-[60] w-[min(720px,calc(100%-2rem))] -translate-x-1/2"
    >
      <div
        className={cn(
          'flex items-end gap-3 rounded-[22px] border px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-colors',
          disabled
            ? 'border-[rgba(249,115,22,0.08)] bg-[#111111]/90 opacity-70'
            : 'border-[rgba(249,115,22,0.15)] bg-[#171717]/94 shadow-[0_0_8px_rgba(249,115,22,0.06)] focus-within:border-[#f97316]/40 focus-within:shadow-[0_20px_44px_rgba(0,0,0,0.52)]'
        )}
      >
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed"
          aria-label="Attach asset"
        >
          <Plus className="h-4 w-4" />
        </button>

        <label className="flex-1">
          <span className="sr-only">Prompt</span>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={1}
            disabled={disabled}
            placeholder={placeholder}
            className="max-h-40 min-h-[48px] w-full resize-none bg-transparent pt-2 text-sm leading-6 text-white outline-none placeholder:text-zinc-500"
            style={{ fontFamily: "'DM Sans', Inter, sans-serif" }}
          />
        </label>

        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed"
            aria-label="Prompt settings"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={disabled || isSubmitting || value.trim().length === 0}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
            aria-label="Submit prompt"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
