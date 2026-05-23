import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';

export type FlowVisibility = 'private' | 'shared' | 'public';

export interface SavedFlow {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  originProjectId?: string | null;
  isTemplate?: boolean;
  tags?: string[];
  schemaVersion: string;
  graphMetadata: Record<string, unknown>;
  viewState: Record<string, unknown>;
  visibility: FlowVisibility;
  slug?: string | null;
  templateCategory?: string | null;
  remixParentFlowId?: string | null;
  remixCount: number;
  publishedAt?: Date | null;
  featuredRank?: number | null;
  userId?: string | null;
}

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `flow-${Date.now().toString(36)}`;

const mapFlowRow = (flow: any): SavedFlow => ({
  id: flow.id,
  name: flow.name,
  description: flow.description,
  thumbnail: flow.thumbnail_url,
  nodeCount: flow.node_count || 0,
  edgeCount: flow.edge_count || 0,
  createdAt: new Date(flow.created_at),
  updatedAt: new Date(flow.updated_at),
  projectId: flow.project_id,
  originProjectId: flow.origin_project_id ?? null,
  isTemplate: flow.is_template,
  tags: flow.tags,
  schemaVersion: typeof flow.schema_version === 'string' ? flow.schema_version : '1',
  graphMetadata:
    flow.graph_metadata && typeof flow.graph_metadata === 'object' ? flow.graph_metadata : {},
  viewState:
    flow.view_state && typeof flow.view_state === 'object' ? flow.view_state : {},
  visibility: (flow.visibility as FlowVisibility) ?? 'private',
  slug: flow.slug ?? null,
  templateCategory: flow.template_category ?? null,
  remixParentFlowId: flow.remix_parent_flow_id ?? null,
  remixCount: flow.remix_count ?? 0,
  publishedAt: flow.published_at ? new Date(flow.published_at) : null,
  featuredRank: flow.featured_rank ?? null,
  userId: flow.user_id ?? null,
});

interface FlowsState {
  savedFlows: SavedFlow[];
  publicTemplates: SavedFlow[];
  isLoading: boolean;
  error: string | null;
  selectedFlowId: string | null;

  fetchFlows: (projectId: string) => Promise<void>;
  fetchPublicTemplates: (category?: string) => Promise<void>;
  saveCurrentFlow: (projectId: string, name: string, description?: string) => Promise<void>;
  loadFlow: (flowId: string) => Promise<void>;
  deleteFlow: (flowId: string) => Promise<void>;
  duplicateFlow: (flowId: string, newName: string) => Promise<void>;
  renameFlow: (flowId: string, newName: string) => Promise<void>;
  publishFlow: (flowId: string, opts?: { templateCategory?: string; visibility?: FlowVisibility }) => Promise<string | null>;
  unpublishFlow: (flowId: string) => Promise<void>;
  remixFlow: (templateFlowId: string, targetProjectId: string, newName?: string) => Promise<string | null>;
  getShareUrl: (flow: SavedFlow) => string | null;
  setSelectedFlow: (flowId: string | null) => void;
}

export const useFlowsStore = create<FlowsState>()(
  persist(
    (set, get) => ({
      savedFlows: [],
      publicTemplates: [],
      isLoading: false,
      error: null,
      selectedFlowId: null,

      fetchFlows: async (projectId: string) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await (supabase
            .from('saved_flows' as any)
            .select('*')
            .eq('project_id', projectId)
            .order('updated_at', { ascending: false }) as any);

          if (error) throw error;

          set({
            savedFlows: ((data as any[]) ?? []).map(mapFlowRow),
            isLoading: false,
          });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      fetchPublicTemplates: async (category?: string) => {
        set({ isLoading: true, error: null });
        try {
          let query = (supabase
            .from('saved_flows' as any)
            .select('*')
            .eq('visibility', 'public')
            .order('featured_rank', { ascending: true, nullsFirst: false })
            .order('remix_count', { ascending: false })
            .limit(60) as any);
          if (category) query = query.eq('template_category', category);

          const { data, error } = await query;
          if (error) throw error;
          set({
            publicTemplates: ((data as any[]) ?? []).map(mapFlowRow),
            isLoading: false,
          });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      saveCurrentFlow: async (projectId: string, name: string, description?: string) => {
        set({ isLoading: true, error: null });
        try {
          const { useComputeFlowStore } = await import('@/store/computeFlowStore');
          const { nodeDefinitions, edgeDefinitions, schemaVersion, graphMetadata, viewState } =
            useComputeFlowStore.getState();

          const { error } = await (supabase
            .from('saved_flows' as any)
            .insert({
              project_id: projectId,
              origin_project_id: projectId,
              name,
              description,
              node_count: nodeDefinitions.length,
              edge_count: edgeDefinitions.length,
              schema_version: schemaVersion,
              graph_metadata: graphMetadata,
              view_state: viewState,
              flow_data: {
                schemaVersion,
                graphMetadata,
                viewState,
                nodes: nodeDefinitions,
                edges: edgeDefinitions,
              },
            }) as any);

          if (error) throw error;

          await get().fetchFlows(projectId);
          set({ isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      loadFlow: async (flowId: string) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await (supabase
            .from('saved_flows' as any)
            .select('flow_data, schema_version, graph_metadata, view_state')
            .eq('id', flowId)
            .single() as any);

          if (error) throw error;

          const { useComputeFlowStore } = await import('@/store/computeFlowStore');
          const { setGraphAtomic } = useComputeFlowStore.getState();

          if (data?.flow_data) {
            useComputeFlowStore.setState({
              schemaVersion:
                typeof data.schema_version === 'string'
                  ? data.schema_version
                  : typeof data.flow_data?.schemaVersion === 'string'
                    ? data.flow_data.schemaVersion
                    : '1',
              graphMetadata:
                data.graph_metadata && typeof data.graph_metadata === 'object'
                  ? data.graph_metadata
                  : data.flow_data?.graphMetadata && typeof data.flow_data.graphMetadata === 'object'
                    ? data.flow_data.graphMetadata
                    : {},
              viewState:
                data.view_state && typeof data.view_state === 'object'
                  ? data.view_state
                  : data.flow_data?.viewState && typeof data.flow_data.viewState === 'object'
                    ? data.flow_data.viewState
                    : {},
            });
            setGraphAtomic(data.flow_data.nodes || [], data.flow_data.edges || [], {
              skipHistory: false,
              skipDirty: false,
            });
          }

          set({ selectedFlowId: flowId, isLoading: false });
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      deleteFlow: async (flowId: string) => {
        try {
          const { error } = await (supabase.from('saved_flows' as any).delete().eq('id', flowId) as any);

          if (error) throw error;

          set((state) => ({
            savedFlows: state.savedFlows.filter((flow) => flow.id !== flowId),
            selectedFlowId: state.selectedFlowId === flowId ? null : state.selectedFlowId,
          }));
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      duplicateFlow: async (flowId: string, newName: string) => {
        const flow = get().savedFlows.find((item) => item.id === flowId);
        if (!flow) return;

        try {
          const { data: originalData } = await (supabase
            .from('saved_flows' as any)
            .select('flow_data')
            .eq('id', flowId)
            .single() as any);

          const { error } = await (supabase.from('saved_flows' as any).insert({
            project_id: flow.projectId,
            origin_project_id: flow.originProjectId ?? flow.projectId,
            name: newName,
            description: flow.description,
            flow_data: originalData?.flow_data,
            node_count: flow.nodeCount,
            edge_count: flow.edgeCount,
            schema_version: flow.schemaVersion,
            graph_metadata: flow.graphMetadata,
            view_state: flow.viewState,
            visibility: 'private',
          }) as any);

          if (error) throw error;

          await get().fetchFlows(flow.projectId);
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      renameFlow: async (flowId: string, newName: string) => {
        try {
          const { error } = await (supabase
            .from('saved_flows' as any)
            .update({ name: newName, updated_at: new Date().toISOString() })
            .eq('id', flowId) as any);

          if (error) throw error;

          set((state) => ({
            savedFlows: state.savedFlows.map((flow) =>
              flow.id === flowId ? { ...flow, name: newName, updatedAt: new Date() } : flow
            ),
          }));
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      publishFlow: async (flowId, opts) => {
        const flow = get().savedFlows.find((f) => f.id === flowId);
        if (!flow) return null;
        try {
          const visibility: FlowVisibility = opts?.visibility ?? 'public';
          const slug = flow.slug ?? `${slugify(flow.name)}-${flowId.slice(0, 6)}`;
          const { error } = await (supabase
            .from('saved_flows' as any)
            .update({
              visibility,
              slug,
              template_category: opts?.templateCategory ?? flow.templateCategory ?? 'music',
              published_at: new Date().toISOString(),
            })
            .eq('id', flowId) as any);
          if (error) throw error;

          set((state) => ({
            savedFlows: state.savedFlows.map((f) =>
              f.id === flowId
                ? {
                    ...f,
                    visibility,
                    slug,
                    templateCategory: opts?.templateCategory ?? f.templateCategory ?? 'music',
                    publishedAt: new Date(),
                  }
                : f
            ),
          }));
          return slug;
        } catch (error: any) {
          set({ error: error.message });
          return null;
        }
      },

      unpublishFlow: async (flowId) => {
        try {
          const { error } = await (supabase
            .from('saved_flows' as any)
            .update({ visibility: 'private', published_at: null })
            .eq('id', flowId) as any);
          if (error) throw error;
          set((state) => ({
            savedFlows: state.savedFlows.map((f) =>
              f.id === flowId ? { ...f, visibility: 'private', publishedAt: null } : f
            ),
          }));
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      remixFlow: async (templateFlowId, targetProjectId, newName) => {
        try {
          const { data, error } = await (supabase
            .from('saved_flows' as any)
            .select('*')
            .eq('id', templateFlowId)
            .single() as any);
          if (error) throw error;
          if (!data) throw new Error('Template not found');

          const remixName = newName ?? `${data.name} (Remix)`;
          const { data: inserted, error: insertErr } = await (supabase
            .from('saved_flows' as any)
            .insert({
              project_id: targetProjectId,
              origin_project_id: targetProjectId,
              name: remixName,
              description: data.description,
              flow_data: data.flow_data,
              node_count: data.node_count,
              edge_count: data.edge_count,
              schema_version: data.schema_version,
              graph_metadata: data.graph_metadata,
              view_state: data.view_state,
              visibility: 'private',
              remix_parent_flow_id: templateFlowId,
            })
            .select('id')
            .single() as any);
          if (insertErr) throw insertErr;

          // best-effort: bump remix counter on the template (will silently fail for non-owners under RLS)
          await (supabase
            .from('saved_flows' as any)
            .update({ remix_count: (data.remix_count ?? 0) + 1 })
            .eq('id', templateFlowId) as any);

          await get().fetchFlows(targetProjectId);
          return inserted?.id ?? null;
        } catch (error: any) {
          set({ error: error.message });
          return null;
        }
      },

      getShareUrl: (flow) => {
        if (flow.visibility === 'private' || !flow.slug) return null;
        if (typeof window === 'undefined') return `/flows/${flow.slug}`;
        return `${window.location.origin}/flows/${flow.slug}`;
      },

      setSelectedFlow: (flowId: string | null) => {
        set({ selectedFlowId: flowId });
      },
    }),
    {
      name: 'wzrd-flows-storage',
      partialize: (state) => ({ selectedFlowId: state.selectedFlowId }),
    }
  )
);
