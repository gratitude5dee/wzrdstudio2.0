import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useComputeFlowStore } from '@/store/computeFlowStore';
import { NodeStatusBadge, type NodeStatus } from './NodeStatusBadge';

interface NodeRuntimeStatusProps {
  nodeId: string;
  className?: string;
}

export const NodeRuntimeStatus = memo(({ nodeId, className }: NodeRuntimeStatusProps) => {
  const runtime = useComputeFlowStore(
    useShallow((state) => {
      const node = state.nodeDefinitions.find((item) => item.id === nodeId);
      return {
        status: (node?.status ?? 'idle') as NodeStatus,
        progress: typeof node?.progress === 'number' ? node.progress : 0,
        error: node?.error,
      };
    })
  );

  return (
    <NodeStatusBadge
      status={runtime.status}
      progress={runtime.progress}
      error={runtime.error}
      className={className}
    />
  );
});

NodeRuntimeStatus.displayName = 'NodeRuntimeStatus';
