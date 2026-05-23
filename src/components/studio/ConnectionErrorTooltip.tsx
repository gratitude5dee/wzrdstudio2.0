/**
 * ConnectionErrorTooltip
 *
 * A floating tooltip that appears near a target handle/node when an edge connection
 * is rejected. Shows the specific validation error (e.g., type mismatch, cycle detected).
 * Auto-dismisses after a brief delay.
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import type { ConnectionRejection } from '@/hooks/useConnectionFeedback';

interface ConnectionErrorTooltipProps {
  rejection: ConnectionRejection | null;
}

export const ConnectionErrorTooltip = memo(
  ({ rejection }: ConnectionErrorTooltipProps) => {
    return (
      <AnimatePresence>
        {rejection && (
          <motion.div
            key={rejection.key}
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-none fixed z-[9999]"
            style={{
              left: rejection.position.x,
              top: rejection.position.y - 8,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/90 px-3 py-1.5 shadow-lg shadow-red-500/10 backdrop-blur-sm">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span className="max-w-[280px] text-xs font-medium leading-tight text-red-200">
                {rejection.error}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

ConnectionErrorTooltip.displayName = 'ConnectionErrorTooltip';
