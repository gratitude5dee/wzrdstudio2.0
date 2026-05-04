import { Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoiceSessionStatus } from '@/voice/realtime/useWzrdRealtimeSession';

interface VoiceActionButtonProps {
  status: VoiceSessionStatus;
  errorMessage?: string | null;
  disabled?: boolean;
  onPressStart: () => void | Promise<void>;
  onPressEnd: () => void | Promise<void>;
}

const STATUS_LABELS: Record<VoiceSessionStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  confirming: 'Confirming',
  error: 'Voice unavailable',
};

export function VoiceActionButton({
  status,
  errorMessage,
  disabled,
  onPressStart,
  onPressEnd,
}: VoiceActionButtonProps) {
  const [pressed, setPressed] = useState(false);

  const start = useCallback(() => {
    if (disabled || pressed) return;
    setPressed(true);
    void onPressStart();
  }, [disabled, onPressStart, pressed]);

  const stop = useCallback(() => {
    if (!pressed) return;
    setPressed(false);
    void onPressEnd();
  }, [onPressEnd, pressed]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      start();
    },
    [start],
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      stop();
    },
    [stop],
  );

  const Icon = status === 'connecting' || status === 'thinking' ? Loader2 : status === 'speaking' ? Volume2 : status === 'error' ? MicOff : Mic;

  return (
    <div
      data-testid="voice-action-button-container"
      className="pointer-events-none fixed bottom-20 right-4 z-[80] flex flex-row-reverse items-center gap-2 md:bottom-4"
    >
      <Button
        type="button"
        aria-label="Hold to speak"
        disabled={disabled}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        className={cn(
          'pointer-events-auto h-12 w-12 rounded-full border border-white/15 bg-zinc-950/90 p-0 text-white shadow-2xl shadow-black/40 backdrop-blur transition',
          'hover:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-orange-400',
          status === 'listening' && 'border-orange-400 bg-orange-500 text-black shadow-orange-500/30',
          status === 'error' && 'border-red-400 bg-red-500/15 text-red-100',
        )}
      >
        <Icon className={cn('h-5 w-5', (status === 'connecting' || status === 'thinking') && 'animate-spin')} />
      </Button>

      {(status !== 'idle' || errorMessage) && (
        <div className="pointer-events-none max-w-[240px] rounded-md border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-100 shadow-xl backdrop-blur">
          <div className="font-medium">{STATUS_LABELS[status]}</div>
          {errorMessage ? <div className="mt-1 text-zinc-400">{errorMessage}</div> : null}
        </div>
      )}
    </div>
  );
}
