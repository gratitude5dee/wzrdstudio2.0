import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useComputeFlowStore } from '@/store/computeFlowStore';
import type { NodeDefinition, EdgeDefinition, Port, DataType, NodeStatus } from '@/types/computeFlow';
import { normalizeNodeKind, normalizeNodeStatus } from '@/lib/compute/contract';
import { isWithinEchoWindow } from '@/lib/studio/clientWriteId';

export function useComputeFlowRealtime(projectId: string | undefined) {
  const { 
    addNodeSilent,
    updateNodeSilent,
    removeNodeSilent,
    addEdgeSilent,
    removeEdgeSilent,
    setNodeStatus,
  } = useComputeFlowStore();

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
          if (isWithinEchoWindow(projectId)) {
            return;
          }
          console.log('📥 Node inserted:', payload.new);
          const n = payload.new as any;
          const node: NodeDefinition = {
            id: n.id,
            kind: normalizeNodeKind(n.kind) ?? 'Transform',
            version: n.version,
            label: n.label,
            position: n.position,
            size: n.size,
            inputs: n.inputs as Port[],
            outputs: n.outputs as Port[],
            params: n.params,
            metadata: n.metadata,
            preview: n.preview,
            status: normalizeNodeStatus(n.status) as NodeStatus,
            progress: n.progress,
            error: n.error,
            isDirty: n.is_dirty,
          };
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
          if (isWithinEchoWindow(projectId)) {
            return;
          }
          console.log('📝 Node updated:', payload.new);
          const n = payload.new as any;
          updateNodeSilent(n.id, {
            kind: normalizeNodeKind(n.kind) ?? 'Transform',
            label: n.label,
            position: n.position,
            size: n.size,
            inputs: n.inputs as Port[],
            outputs: n.outputs as Port[],
            params: n.params,
            metadata: n.metadata,
            preview: n.preview,
            status: normalizeNodeStatus(n.status) as NodeStatus,
            progress: n.progress,
            error: n.error,
            isDirty: n.is_dirty,
          });
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
          if (isWithinEchoWindow(projectId)) {
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
          if (isWithinEchoWindow(projectId)) {
            return;
          }
          console.log('📥 Edge inserted:', payload.new);
          const e = payload.new as any;
          const edge: EdgeDefinition = {
            id: e.id,
            source: {
              nodeId: e.source_node_id,
              portId: e.source_port_id,
              handle: e.source_handle ?? undefined,
            },
            target: {
              nodeId: e.target_node_id,
              portId: e.target_port_id,
              handle: e.target_handle ?? undefined,
            },
            dataType: e.data_type as DataType,
            status: e.status,
            metadata: e.metadata,
          };
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
          if (isWithinEchoWindow(projectId)) {
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
