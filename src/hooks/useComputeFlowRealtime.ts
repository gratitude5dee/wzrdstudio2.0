import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { NodeDefinition, EdgeDefinition, Port, DataType, NodeStatus } from '@/types/computeFlow';
import { normalizeNodeKind, normalizeNodeStatus } from '@/lib/compute/contract';
import { isOwnClientWriteId, isWithinEchoWindow } from '@/lib/studio/clientWriteId';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function realtimeNodeFromPayload(record: any): NodeDefinition {
  return {
    id: record.id,
    kind: normalizeNodeKind(record.kind) ?? 'Transform',
    version: record.version,
    label: record.label,
    position: record.position,
    size: record.size,
    inputs: record.inputs as Port[],
    outputs: record.outputs as Port[],
    params: record.params,
    metadata: record.metadata,
    preview: record.preview,
    status: normalizeNodeStatus(record.status) as NodeStatus,
    progress: record.progress,
    error: record.error,
    isDirty: record.is_dirty,
  };
}

function realtimeEdgeFromPayload(record: any): EdgeDefinition {
  return {
    id: record.id,
    source: {
      nodeId: record.source_node_id,
      portId: record.source_port_id,
      handle: record.source_handle ?? undefined,
    },
    target: {
      nodeId: record.target_node_id,
      portId: record.target_port_id,
      handle: record.target_handle ?? undefined,
    },
    dataType: record.data_type as DataType,
    status: record.status,
    metadata: record.metadata,
  };
}

function nodesEquivalent(left: NodeDefinition, right: NodeDefinition): boolean {
  return stableStringify({
    kind: left.kind,
    version: left.version,
    label: left.label,
    position: left.position,
    size: left.size,
    inputs: left.inputs,
    outputs: left.outputs,
    params: left.params,
    metadata: left.metadata,
    preview: left.preview,
    status: left.status,
    progress: left.progress,
    error: left.error,
    isDirty: left.isDirty,
  }) === stableStringify({
    kind: right.kind,
    version: right.version,
    label: right.label,
    position: right.position,
    size: right.size,
    inputs: right.inputs,
    outputs: right.outputs,
    params: right.params,
    metadata: right.metadata,
    preview: right.preview,
    status: right.status,
    progress: right.progress,
    error: right.error,
    isDirty: right.isDirty,
  });
}

function edgesEquivalent(left: EdgeDefinition, right: EdgeDefinition): boolean {
  return stableStringify({
    source: left.source,
    target: left.target,
    dataType: left.dataType,
    status: left.status,
    metadata: left.metadata,
  }) === stableStringify({
    source: right.source,
    target: right.target,
    dataType: right.dataType,
    status: right.status,
    metadata: right.metadata,
  });
}

export function useComputeFlowRealtime(projectId: string | undefined) {
  const addNodeSilent = useComputeFlowStore((state) => state.addNodeSilent);
  const updateNodeSilent = useComputeFlowStore((state) => state.updateNodeSilent);
  const removeNodeSilent = useComputeFlowStore((state) => state.removeNodeSilent);
  const addEdgeSilent = useComputeFlowStore((state) => state.addEdgeSilent);
  const removeEdgeSilent = useComputeFlowStore((state) => state.removeEdgeSilent);
  const setNodeStatus = useComputeFlowStore((state) => state.setNodeStatus);

  useEffect(() => {
    if (!projectId) return;

    console.log('🔌 Setting up compute flow realtime subscriptions for project:', projectId);

    // Subscribe to compute_nodes changes
    const nodesChannel = supabase
      .channel(`compute-nodes:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'compute_nodes',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (isWithinEchoWindow(projectId) || isOwnClientWriteId((payload.new as any)?.metadata)) {
            return;
          }
          console.log('📥 Node inserted:', payload.new);
          const node = realtimeNodeFromPayload(payload.new as any);
          const existing = useComputeFlowStore.getState().nodeDefinitions.find((candidate) => candidate.id === node.id);
          if (existing) {
            if (!nodesEquivalent(existing, node)) {
              updateNodeSilent(node.id, node);
            }
            return;
          }
          addNodeSilent(node);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'compute_nodes',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (isWithinEchoWindow(projectId) || isOwnClientWriteId((payload.new as any)?.metadata)) {
            return;
          }
          console.log('📝 Node updated:', payload.new);
          const node = realtimeNodeFromPayload(payload.new as any);
          const existing = useComputeFlowStore.getState().nodeDefinitions.find((candidate) => candidate.id === node.id);
          if (!existing) {
            addNodeSilent(node);
            return;
          }
          if (!nodesEquivalent(existing, node)) {
            updateNodeSilent(node.id, node);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'compute_nodes',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (isWithinEchoWindow(projectId) || isOwnClientWriteId((payload.old as any)?.metadata)) {
            return;
          }
          console.log('🗑️ Node deleted:', payload.old);
          removeNodeSilent((payload.old as any).id);
        }
      )
      .subscribe((status) => {
        console.log('Nodes channel status:', status);
      });

    // Subscribe to compute_edges changes
    const edgesChannel = supabase
      .channel(`compute-edges:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'compute_edges',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (isWithinEchoWindow(projectId) || isOwnClientWriteId((payload.new as any)?.metadata)) {
            return;
          }
          console.log('📥 Edge inserted:', payload.new);
          const edge = realtimeEdgeFromPayload(payload.new as any);
          const existing = useComputeFlowStore.getState().edgeDefinitions.find((candidate) => candidate.id === edge.id);
          if (existing) {
            if (!edgesEquivalent(existing, edge)) {
              removeEdgeSilent(edge.id);
              addEdgeSilent(edge);
            }
            return;
          }
          addEdgeSilent(edge);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'compute_edges',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (isWithinEchoWindow(projectId) || isOwnClientWriteId((payload.old as any)?.metadata)) {
            return;
          }
          console.log('🗑️ Edge deleted:', payload.old);
          removeEdgeSilent((payload.old as any).id);
        }
      )
      .subscribe((status) => {
        console.log('Edges channel status:', status);
      });

    // Subscribe to compute_run_events for status updates
    const eventsChannel = supabase
      .channel(`compute-run-events:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'compute_run_events',
        },
        (payload) => {
          console.log('⚡ Run event:', payload.new);
          const event = payload.new as any;
          setNodeStatus(event.node_id, normalizeNodeStatus(event.status) as NodeStatus, event.progress);
        }
      )
      .subscribe((status) => {
        console.log('Events channel status:', status);
      });

    return () => {
      console.log('🔌 Cleaning up compute flow realtime subscriptions');
      supabase.removeChannel(nodesChannel);
      supabase.removeChannel(edgesChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [
    projectId,
    addNodeSilent,
    updateNodeSilent,
    removeNodeSilent,
    addEdgeSilent,
    removeEdgeSilent,
    setNodeStatus,
  ]);
}
