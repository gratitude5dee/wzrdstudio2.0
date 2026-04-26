
-- Step 1: Create compute_graphs table
CREATE TABLE public.compute_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT '1',
  graph_metadata JSONB NOT NULL DEFAULT '{}',
  view_state JSONB NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

ALTER TABLE public.compute_graphs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own project graphs"
  ON public.compute_graphs FOR SELECT
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Users can insert own project graphs"
  ON public.compute_graphs FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY "Users can update own project graphs"
  ON public.compute_graphs FOR UPDATE
  TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY "Users can delete own project graphs"
  ON public.compute_graphs FOR DELETE
  TO authenticated
  USING (public.can_access_project(project_id));

-- Timestamp trigger
CREATE TRIGGER update_compute_graphs_updated_at
  BEFORE UPDATE ON public.compute_graphs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 2: Create save_compute_graph RPC
CREATE OR REPLACE FUNCTION public.save_compute_graph(
  p_project_id UUID,
  p_expected_revision INTEGER,
  p_schema_version TEXT,
  p_graph_metadata JSONB,
  p_view_state JSONB,
  p_nodes JSONB,
  p_edges JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_revision INTEGER;
  v_new_revision INTEGER;
  v_user_id UUID;
  v_node JSONB;
  v_edge JSONB;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check project access
  IF NOT public.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'Access denied to project';
  END IF;

  -- Get current revision (lock row)
  SELECT revision INTO v_current_revision
  FROM compute_graphs
  WHERE project_id = p_project_id
  FOR UPDATE;

  IF FOUND THEN
    -- Check revision match
    IF v_current_revision != p_expected_revision THEN
      RAISE EXCEPTION 'revision mismatch';
    END IF;
    v_new_revision := v_current_revision + 1;
    UPDATE compute_graphs SET
      schema_version = p_schema_version,
      graph_metadata = p_graph_metadata,
      view_state = p_view_state,
      revision = v_new_revision,
      updated_at = now()
    WHERE project_id = p_project_id;
  ELSE
    -- First save
    v_new_revision := 1;
    INSERT INTO compute_graphs (project_id, schema_version, graph_metadata, view_state, revision)
    VALUES (p_project_id, p_schema_version, p_graph_metadata, p_view_state, v_new_revision);
  END IF;

  -- Replace nodes
  DELETE FROM compute_nodes WHERE project_id = p_project_id;
  FOR v_node IN SELECT * FROM jsonb_array_elements(p_nodes)
  LOOP
    INSERT INTO compute_nodes (
      id, project_id, user_id, kind, label, version,
      position, size, inputs, outputs, params,
      metadata, preview, status, progress, error, is_dirty
    ) VALUES (
      (v_node->>'id')::UUID,
      p_project_id,
      v_user_id,
      v_node->>'kind',
      COALESCE(v_node->>'label', v_node->>'kind'),
      COALESCE(v_node->>'version', '1'),
      COALESCE(v_node->'position', '{"x":0,"y":0}'::JSONB),
      v_node->'size',
      COALESCE(v_node->'inputs', '[]'::JSONB),
      COALESCE(v_node->'outputs', '[]'::JSONB),
      COALESCE(v_node->'params', '{}'::JSONB),
      v_node->'metadata',
      v_node->'preview',
      COALESCE(v_node->>'status', 'idle'),
      (v_node->>'progress')::NUMERIC,
      v_node->>'error',
      COALESCE((v_node->>'isDirty')::BOOLEAN, false)
    );
  END LOOP;

  -- Replace edges
  DELETE FROM compute_edges WHERE project_id = p_project_id;
  FOR v_edge IN SELECT * FROM jsonb_array_elements(p_edges)
  LOOP
    INSERT INTO compute_edges (
      id, project_id,
      source_node_id, source_port_id,
      target_node_id, target_port_id,
      data_type, status, metadata
    ) VALUES (
      (v_edge->>'id')::UUID,
      p_project_id,
      (v_edge->>'source_node_id')::UUID,
      v_edge->>'source_port_id',
      (v_edge->>'target_node_id')::UUID,
      v_edge->>'target_port_id',
      COALESCE(v_edge->>'data_type', 'any'),
      COALESCE(v_edge->>'status', 'idle'),
      v_edge->'metadata'
    );
  END LOOP;

  v_updated_at := now();

  RETURN jsonb_build_object(
    'success', true,
    'revision', v_new_revision,
    'updated_at', v_updated_at
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
