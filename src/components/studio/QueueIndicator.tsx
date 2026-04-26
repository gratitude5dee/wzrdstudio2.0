import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronUp, ChevronDown, Check, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useComputeFlowStore } from '@/store/computeFlowStore';

interface QueueItem {
  id: string;
  label: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress?: number;
}

interface QueueIndicatorProps {
  className?: string;
  rightOffsetPx?: number;
  inline?: boolean;
  alwaysVisible?: boolean;
}

export const QueueIndicator: React.FC<QueueIndicatorProps> = ({
  className,
  inline = false,
  alwaysVisible = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { nodeDefinitions } = useComputeFlowStore();

  // Derive queue items from node definitions
  const queueItems: QueueItem[] = nodeDefinitions
    .filter(node => ['queued', 'running'].includes(node.status))
    .map(node => ({
      id: node.id,
      label: node.label,
      status: node.status as QueueItem['status'],
      progress: node.progress,
    }));

  const activeCount = queueItems.filter(i => i.status === 'running').length;
  const queuedCount = queueItems.filter(i => i.status === 'queued').length;
  const totalCount = activeCount + queuedCount;

  if (!alwaysVisible && totalCount === 0) return null;

  const container = (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[#111111]/96 shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-2xl min-w-[200px]">
      <button
        onClick={() => totalCount > 0 && setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#d4a574]" />
          ) : (
            <Clock className="h-4 w-4 text-zinc-500" />
          )}
          <span className="text-sm font-medium text-zinc-300">Queue</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {totalCount === 0 ? (
              <span>0 active</span>
            ) : (
              <>
                {activeCount > 0 && <span className="text-[#d4a574]">{activeCount} active</span>}
                {activeCount > 0 && queuedCount > 0 && ', '}
                {queuedCount > 0 && <span className="text-zinc-400">{queuedCount} queued</span>}
              </>
            )}
          </span>
          {totalCount > 0 ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            ) : (
              <ChevronUp className="h-4 w-4 text-zinc-500" />
            )
          ) : (
            <ChevronUp className="h-4 w-4 text-zinc-700" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && queueItems.length > 0 ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/8"
          >
            <div className="max-h-48 overflow-y-auto">
              {queueItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 border-b border-white/6 px-4 py-2.5 last:border-b-0"
                >
                  {item.status === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d4a574] flex-shrink-0" />
                  ) : item.status === 'succeeded' ? (
                    <Check className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                  ) : item.status === 'failed' ? (
                    <X className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs text-zinc-300">{item.label}</p>
                    {item.status === 'running' && item.progress !== undefined ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#1c1c1c]">
                        <motion.div
                          className="h-full rounded-full bg-[#f97316]"
                          initial={{ width: 0 }}
                          animate={{ width: `${item.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    ) : null}
                  </div>

                  {item.status === 'running' && item.progress !== undefined ? (
                    <span className="flex-shrink-0 text-[10px] text-zinc-500">{item.progress}%</span>
                  ) : null}
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  if (inline) {
    return container;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn('fixed top-[74px] left-4 z-50', className)}
      data-walkthrough="queue"
    >
      {container}
    </motion.div>
  );
};

export default QueueIndicator;
