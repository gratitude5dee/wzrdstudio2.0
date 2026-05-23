CREATE OR REPLACE FUNCTION public.save_compute_graph(
  p_project_id UUID,
  p_expected_revision INTEGER,
  p_schema_version TEXT,
  p_graph_metadata JSONB,
  p_view_state JSONB,
  p_nodes JSONB,
  p_edges JSONB
)
RETURNS TABLE(success BOOLEAN, revision INTEGER, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_revision INTEGER;
  v_next_revision INTEGER;
BEGIN
  SELECT user_id
  INTO v_user_id
  FROM public.projects
  WHERE id = p_project_id
    AND user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  INSERT INTO public.compute_graphs (
    project_id,
    schema_version,
    graph_metadata,
    view_state,
    revision
  )
  VALUES (
    p_project_id,
    COALESCE(p_schema_version, '1'),
    COALESCE(p_graph_metadata, '{}'::jsonb),
    COALESCE(p_view_state, '{"zoom":1,"center":[0,0]}'::jsonb),
    0
  )
  ON CONFLICT (project_id) DO NOTHING;

  SELECT revision
  INTO v_current_revision
  FROM public.compute_graphs
  WHERE project_id = p_project_id
  FOR UPDATE;

  IF COALESCE(p_expected_revision, 0) <> COALESCE(v_current_revision, 0) THEN
    RAISE EXCEPTION 'Revision mismatch: expected %, current %',
      COALESCE(p_expected_revision, 0),
      COALESCE(v_current_revision, 0);
  END IF;

  v_next_revision := COALESCE(v_current_revision, 0) + 1;

  UPDATE public.compute_graphs
  SET
    schema_version = COALESCE(p_schema_version, schema_version),
    graph_metadata = COALESCE(p_graph_metadata, '{}'::jsonb),
    view_state = COALESCE(p_view_state, '{"zoom":1,"center":[0,0]}'::jsonb),
    revision = v_next_revision,
    updated_at = NOW()
  WHERE project_id = p_project_id;

  DELETE FROM public.compute_edges
  WHERE project_id = p_project_id;

  DELETE FROM public.compute_nodes
  WHERE project_id = p_project_id;

  INSERT INTO public.compute_nodes (
    id,
    project_id,
    user_id,
    kind,
    label,
    version,
    position,
    size,
    inputs,
    outputs,
    params,
    metadata,
    preview,
    status,
    progress,
    error,
    is_dirty
  )
  SELECT
    COALESCE(NULLIF(node->>'id', '')::uuid, gen_random_uuid()),
    p_project_id,
    v_user_id,
    COALESCE(node->>'kind', 'Transform'),
    COALESCE(node->>'label', 'Untitled Node'),
    COALESCE(node->>'version', '1.0.0'),
    COALESCE(node->'position', '{"x":0,"y":0}'::jsonb),
    CASE
      WHEN node ? 'size' AND node->'size' <> 'null'::jsonb THEN node->'size'
      ELSE NULL
    END,
    COALESCE(node->'inputs', '[]'::jsonb),
    COALESCE(node->'outputs', '[]'::jsonb),
    COALESCE(node->'params', '{}'::jsonb),
    CASE
      WHEN node ? 'metadata' AND node->'metadata' <> 'null'::jsonb THEN node->'metadata'
      ELSE '{}'::jsonb
    END,
    CASE
      WHEN node ? 'preview' AND node->'preview' <> 'null'::jsonb THEN node->'preview'
      ELSE NULL
    END,
    COALESCE(node->>'status', 'idle'),
    COALESCE((node->>'progress')::INTEGER, 0),
    NULLIF(node->>'error', ''),
    COALESCE((node->>'isDirty')::BOOLEAN, false)
  FROM jsonb_array_elements(COALESCE(p_nodes, '[]'::jsonb)) AS node;

  INSERT INTO public.compute_edges (
    id,
    project_id,
    source_node_id,
    source_port_id,
    source_handle,
    target_node_id,
    target_port_id,
    target_handle,
    data_type,
    status,
    metadata
  )
  SELECT
    COALESCE(NULLIF(edge->>'id', '')::uuid, gen_random_uuid()),
    p_project_id,
    COALESCE(NULLIF(edge->'source'->>'nodeId', '')::uuid, NULLIF(edge->>'sourceNodeId', '')::uuid),
    COALESCE(edge->'source'->>'portId', edge->>'sourcePortId', 'output'),
    COALESCE(edge->'source'->>'handle', edge->>'sourceHandle', 'output'),
    COALESCE(NULLIF(edge->'target'->>'nodeId', '')::uuid, NULLIF(edge->>'targetNodeId', '')::uuid),
    COALESCE(edge->'target'->>'portId', edge->>'targetPortId', 'input'),
    COALESCE(edge->'target'->>'handle', edge->>'targetHandle', 'input'),
    COALESCE(edge->>'dataType', 'any'),
    COALESCE(edge->>'status', 'idle'),
    CASE
      WHEN edge ? 'metadata' AND edge->'metadata' <> 'null'::jsonb THEN edge->'metadata'
      ELSE '{}'::jsonb
    END
  FROM jsonb_array_elements(COALESCE(p_edges, '[]'::jsonb)) AS edge;

  RETURN QUERY
  SELECT TRUE, compute_graphs.revision, compute_graphs.updated_at
  FROM public.compute_graphs
  WHERE compute_graphs.project_id = p_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_compute_graph(UUID, INTEGER, TEXT, JSONB, JSONB, JSONB, JSONB) TO authenticated;
