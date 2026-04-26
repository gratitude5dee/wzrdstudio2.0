import React from 'react';
import { motion } from 'framer-motion';
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
  const getStatusConfig = () => {
    switch (status) {
      case 'queued':
        return {
          icon: <Clock className="h-3 w-3" />,
          label: 'Queued',
          color: 'border border-white/8 bg-[#171717]/92 text-zinc-400',
          pulse: true,
        };
      case 'running':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          label: estimatedTime ? `~${estimatedTime}s` : 'Running',
          color: 'border border-[#f97316]/20 bg-[#221a10]/92 text-[#d4a574]',
          pulse: true,
        };
      case 'succeeded':
        return {
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Done',
          color: 'border border-[#f97316]/20 bg-[#221a10]/92 text-[#d4a574]',
          pulse: false,
        };
      case 'failed':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          label: error || 'Error',
          color: 'border border-[#B85050]/20 bg-[#2b1717]/92 text-[#d69c9c]',
          pulse: false,
        };
      case 'canceled':
        return {
          icon: <XCircle className="h-3 w-3" />,
          label: 'Canceled',
          color: 'border border-white/8 bg-[#171717]/92 text-zinc-400',
          pulse: false,
        };
      case 'warning':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Warning',
          color: 'border border-[#A0AA32]/20 bg-[#2a2b17]/92 text-[#c7cf8d]',
          pulse: false,
        };
      case 'dirty':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Dirty',
          color: 'border border-[#A0AA32]/20 bg-[#2a2b17]/92 text-[#c7cf8d]',
          pulse: false,
        };
      default:
        return {
          icon: <Circle className="h-3 w-3" />,
          label: 'Idle',
          color: 'border border-white/8 bg-[#171717]/92 text-zinc-400',
          pulse: false,
        };
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn('absolute right-1 top-1 z-10', className)}
    >
      <span
        className={cn(
          'flex h-5 items-center gap-1.5 rounded-full px-2.5 text-[9px] font-medium uppercase tracking-[0.18em] backdrop-blur-sm',
          config.color,
          config.pulse && 'animate-pulse-subtle'
        )}
      >
        {config.icon}
        {config.label && <span>{config.label}</span>}
      </span>

      {/* Progress ring for running status */}
      {status === 'running' && progress > 0 && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(#f97316 ${progress * 3.6}deg, transparent 0deg)`
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
        />
      )}
    </motion.div>
  );
};

interface NodeProgressBarProps {
  progress: number;
  className?: string;
}

export const NodeProgressBar: React.FC<NodeProgressBarProps> = ({ progress, className }) => {
  return (
    <div className={cn('absolute bottom-0 left-0 right-0 h-1 bg-zinc-800/50 overflow-hidden', className)}>
      <motion.div
        className="h-full bg-gradient-to-r from-[#f97316] to-[#d4a574]"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
};
