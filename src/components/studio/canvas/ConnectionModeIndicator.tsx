import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, MousePointer, XCircle } from 'lucide-react';

interface ConnectionModeIndicatorProps {
  isClickMode: boolean;
  isConnecting: boolean;
  sourceNodeLabel?: string;
  onCancel?: () => void;
}

export const ConnectionModeIndicator: React.FC<ConnectionModeIndicatorProps> = ({
  isClickMode,
  isConnecting,
  sourceNodeLabel = 'Node',
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {isClickMode && isConnecting && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="absolute top-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 rounded-xl border border-[#f97316]/25 bg-[#181510]/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            <Link2 className="h-5 w-5 text-[#d4a574] animate-pulse" />
            
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">
                Click to Connect
              </span>
              <span className="text-xs text-zinc-400">
                From: <span className="font-medium">{sourceNodeLabel}</span>
              </span>
            </div>

            {onCancel && (
              <button
                onClick={onCancel}
                className="ml-2 rounded-md p-1 transition-colors hover:bg-white/10"
              >
                <XCircle className="h-4 w-4 text-white" />
              </button>
            )}
          </div>

          {/* Pulsing cursor indicator */}
          <motion.div
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <MousePointer className="h-4 w-4 text-[#d4a574]" />
            <span className="text-xs font-medium text-[#d4a574]">
              Click a target handle
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
