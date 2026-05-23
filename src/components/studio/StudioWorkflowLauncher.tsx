import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Grid2x2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { EdgeDefinition, NodeDefinition } from '@/types/computeFlow';
import { WorkflowGeneratorTab } from './WorkflowGeneratorTab';

interface StudioWorkflowLauncherProps {
  projectId?: string;
  selectedNodeId?: string | null;
  onWorkflowGenerated: (nodes: NodeDefinition[], edges: EdgeDefinition[]) => void;
  popupMaxHeight?: number | string;
}

export function StudioWorkflowLauncher({
  projectId,
  selectedNodeId,
  onWorkflowGenerated,
  popupMaxHeight = 'calc(100vh - 132px)',
}: StudioWorkflowLauncherProps) {
  const [open, setOpen] = useState(false);
  const selectedNode = useComputeFlowStore((state) =>
    selectedNodeId ? state.nodeDefinitions.find((node) => node.id === selectedNodeId) ?? null : null
  );

  const selectedNodeLabel = useMemo(() => selectedNode?.label || null, [selectedNode?.label]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-11 rounded-full border border-white/10 bg-[#131313]/96 p-0 text-zinc-300 shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition-colors hover:border-white/15 hover:bg-[#191919] hover:text-white"
          aria-label="Open workflow generator"
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <Grid2x2 className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f97316] px-1 text-[9px] font-semibold text-black">
              <Sparkles className="h-2.5 w-2.5" />
            </span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={10}
        collisionPadding={{ top: 72, right: 16, bottom: 20, left: 16 }}
        className="w-[min(468px,calc(100vw-40px))] border-none bg-transparent p-0 shadow-none"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="workflow-launcher"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <WorkflowGeneratorTab
                projectId={projectId}
                selectedNodeId={selectedNodeId}
                selectedNodeLabel={selectedNodeLabel}
                variant="popup"
                maxHeight={popupMaxHeight}
                onClose={() => setOpen(false)}
                onWorkflowGenerated={onWorkflowGenerated}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}

export default StudioWorkflowLauncher;
