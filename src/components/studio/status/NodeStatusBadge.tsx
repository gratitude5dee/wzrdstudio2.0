import React from 'react';
import { AlertCircle, CheckCircle2, Circle, Clock, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NodeStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'warning' | 'canceled' | 'dirty' | 'skipped';

interface NodeStatusBadgeProps {
  status: NodeStatus;
  progress?: number;
  error?: string;
  estimatedTime?: number;
  className?: string;
}

export const NodeStatusBadge: React.FC<NodeStatusBadgeProps> = ({
  status,
  progress = 0,
  error,
  estimatedTime,
  className
}) => {
  if (status === 'idle') return null;

  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
  const getStatusConfig = () => {
    switch (status) {
      case 'queued':
        return {
          icon: <Clock className="h-3 w-3" />,
          label: 'Queued',
          color: 'border border-white/8 bg-[#171717]/92 text-zinc-400',
        };
      case 'running':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          label: estimatedTime ? `~${estimatedTime}s` : 'Running',
          color: 'border border-[#f97316]/20 bg-[#221a10]/92 text-[#d4a574]',
        };
      case 'succeeded':
        return {
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Done',
          color: 'border border-[#f97316]/20 bg-[#221a10]/92 text-[#d4a574]',
        };
      case 'failed':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          label: error || 'Error',
          color: 'border border-[#B85050]/20 bg-[#2b1717]/92 text-[#d69c9c]',
        };
      case 'canceled':
        return {
          icon: <XCircle className="h-3 w-3" />,
          label: 'Canceled',
          color: 'border border-white/8 bg-[#171717]/92 text-zinc-400',
        };
      case 'warning':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Warning',
          color: 'border border-[#A0AA32]/20 bg-[#2a2b17]/92 text-[#c7cf8d]',
        };
      case 'dirty':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Dirty',
          color: 'border border-[#A0AA32]/20 bg-[#2a2b17]/92 text-[#c7cf8d]',
        };
      default:
        return {
          icon: <Circle className="h-3 w-3" />,
          label: 'Idle',
          color: 'border border-white/8 bg-[#171717]/92 text-zinc-400',
        };
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <div className={cn('absolute right-1 top-1 z-10 min-h-5 min-w-[92px]', className)}>
      <span
        className={cn(
          'flex h-5 w-full items-center justify-center gap-1.5 overflow-hidden rounded-full px-2.5 text-[9px] font-medium uppercase tracking-[0.18em] backdrop-blur-sm',
          config.color
        )}
      >
        {config.icon}
        {config.label && <span>{config.label}</span>}
      </span>

      {status === 'running' && safeProgress > 0 && (
        <div className="pointer-events-none absolute bottom-0 left-1 right-1 h-px overflow-hidden rounded-full bg-[#f97316]/10">
          <div
            className="h-full origin-left rounded-full bg-[#f97316] transition-transform duration-200 ease-out"
            style={{ transform: `scaleX(${safeProgress / 100})` }}
          />
        </div>
      )}
    </div>
  );
};

interface NodeProgressBarProps {
  progress: number;
  className?: string;
}

export const NodeProgressBar: React.FC<NodeProgressBarProps> = ({ progress, className }) => {
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));

  return (
    <div className={cn('absolute bottom-0 left-0 right-0 h-1 bg-zinc-800/50 overflow-hidden', className)}>
      <div
        className="h-full bg-gradient-to-r from-[#f97316] to-[#d4a574]"
        style={{
          transform: `scaleX(${safeProgress / 100})`,
          transformOrigin: 'left center',
          transition: 'transform 200ms ease-out',
        }}
      />
    </div>
  );
};
