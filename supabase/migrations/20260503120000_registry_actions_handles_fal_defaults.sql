alter table if exists public.compute_edges
  add column if not exists source_handle text default 'output';

alter table if exists public.compute_edges
  add column if not exists target_handle text default 'input';

alter table if exists public.compute_edges
  drop constraint if exists compute_edges_data_type_check;

alter table if exists public.compute_edges
  add constraint compute_edges_data_type_check check (
    data_type = any (array[
      'image'::text,
      'text'::text,
      'video'::text,
      'tensor'::text,
      'json'::text,
      'audio'::text,
      '3d'::text,
      'string'::text,
      'number'::text,
      'boolean'::text,
      'any'::text
    ])
  );

alter table if exists public.ai_model_catalog
  drop constraint if exists ai_model_catalog_media_type_check;

alter table if exists public.ai_model_catalog
  add constraint ai_model_catalog_media_type_check check (
    media_type = any (array['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'json'::text, '3d'::text])
  );

alter table if exists public.ai_model_catalog
  drop constraint if exists ai_model_catalog_transport_type_check;

alter table if exists public.ai_model_catalog
  add constraint ai_model_catalog_transport_type_check check (
    transport_type = any (array[
      'chat_completion'::text,
      'request_queue'::text,
      'fal_queue'::text,
      'edge_function'::text,
      'direct_http'::text
    ])
  );

insert into public.ai_model_catalog (
  id,
  endpoint_id,
  provider,
  provider_label,
  name,
  description,
  category,
  pricing_text,
  transport_type,
  media_type,
  workflow_type,
  ui_group,
  supports,
  payload_keys,
  defaults,
  controls,
  aliases,
  enabled,
  credits,
  time_label,
  sort_rank,
  raw_api_example,
  raw_payload
) values
  (
    'fal-ai/nano-banana-2',
    'fal-ai/nano-banana-2',
    'fal-ai',
    'fal.ai',
    'Nano Banana 2',
    'Fast Fal image generation and editing.',
    'image-generation',
    'Fal queue pricing',
    'fal_queue',
    'image',
    'text-to-image',
    'generation',
    array['prompt', 'num_images', 'aspect_ratio', 'output_format'],
    array['prompt', 'num_images', 'aspect_ratio', 'output_format'],
    '{"num_images":1,"aspect_ratio":"auto","output_format":"png"}'::jsonb,
    '[]'::jsonb,
    array['nano banana 2'],
    true,
    4,
    '~4s',
    10,
    '',
    '{}'::jsonb
  ),
  (
    'fal-ai/nano-banana-2/edit',
    'fal-ai/nano-banana-2/edit',
    'fal-ai',
    'fal.ai',
    'Nano Banana 2 Edit',
    'Fast Fal image editing.',
    'image-editing',
    'Fal queue pricing',
    'fal_queue',
    'image',
    'image-edit',
    'advanced',
    array['prompt', 'image_urls', 'num_images', 'aspect_ratio', 'output_format'],
    array['prompt', 'image_urls', 'num_images', 'aspect_ratio', 'output_format'],
    '{"num_images":1,"aspect_ratio":"auto","output_format":"png"}'::jsonb,
    '[]'::jsonb,
    array['nano banana edit'],
    true,
    5,
    '~6s',
    20,
    '',
    '{}'::jsonb
  ),
  (
    'fal-ai/kling-video/o3/standard/text-to-video',
    'fal-ai/kling-video/o3/standard/text-to-video',
    'fal-ai',
    'fal.ai',
    'Kling O3 Standard T2V',
    'Balanced Fal text-to-video generation.',
    'video-generation',
    'Fal queue pricing',
    'fal_queue',
    'video',
    'text-to-video',
    'generation',
    array['prompt', 'duration', 'aspect_ratio', 'generate_audio'],
    array['prompt', 'duration', 'aspect_ratio', 'generate_audio'],
    '{"duration":"5","aspect_ratio":"16:9","generate_audio":true}'::jsonb,
    '[]'::jsonb,
    array['kling o3 t2v'],
    true,
    20,
    '~45s',
    30,
    '',
    '{}'::jsonb
  ),
  (
    'fal-ai/kling-video/o3/standard/image-to-video',
    'fal-ai/kling-video/o3/standard/image-to-video',
    'fal-ai',
    'fal.ai',
    'Kling O3 Standard I2V',
    'Fal image-to-video generation.',
    'video-generation',
    'Fal queue pricing',
    'fal_queue',
    'video',
    'image-to-video',
    'generation',
    array['prompt', 'image_url', 'duration', 'generate_audio'],
    array['prompt', 'image_url', 'duration', 'generate_audio'],
    '{"duration":"5","generate_audio":false}'::jsonb,
    '[]'::jsonb,
    array['kling o3 i2v'],
    true,
    24,
    '~60s',
    40,
    '',
    '{}'::jsonb
  ),
  (
    'fal-ai/elevenlabs/tts/turbo-v2.5',
    'fal-ai/elevenlabs/tts/turbo-v2.5',
    'fal-ai',
    'fal.ai',
    'ElevenLabs TTS Turbo',
    'Fal-hosted ElevenLabs text-to-speech.',
    'tts',
    'Fal queue pricing',
    'fal_queue',
    'audio',
    'text-to-speech',
    'generation',
    array['text', 'voice_id'],
    array['text', 'voice_id'],
    '{}'::jsonb,
    '[]'::jsonb,
    array['elevenlabs tts turbo'],
    true,
    4,
    '~5s',
    50,
    '',
    '{}'::jsonb
  )
on conflict (id) do update set
  endpoint_id = excluded.endpoint_id,
  provider = excluded.provider,
  provider_label = excluded.provider_label,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  pricing_text = excluded.pricing_text,
  transport_type = excluded.transport_type,
  media_type = excluded.media_type,
  workflow_type = excluded.workflow_type,
  ui_group = excluded.ui_group,
  supports = excluded.supports,
  payload_keys = excluded.payload_keys,
  defaults = excluded.defaults,
  controls = excluded.controls,
  aliases = excluded.aliases,
  enabled = excluded.enabled,
  credits = excluded.credits,
  time_label = excluded.time_label,
  sort_rank = excluded.sort_rank,
  raw_payload = excluded.raw_payload,
  updated_at = now();

create or replace function public.save_compute_graph(
  p_project_id uuid,
  p_expected_revision integer,
  p_schema_version text,
  p_graph_metadata jsonb,
  p_view_state jsonb,
  p_nodes jsonb,
  p_edges jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current_revision integer;
  v_new_revision integer;
  v_user_id uuid;
  v_node jsonb;
  v_edge jsonb;
  v_updated_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_access_project(p_project_id) then
    raise exception 'Access denied to project';
  end if;

  select revision
  into v_current_revision
  from public.compute_graphs
  where project_id = p_project_id
  for update;

  if found then
    if coalesce(v_current_revision, 0) != coalesce(p_expected_revision, 0) then
      raise exception 'revision mismatch';
    end if;
    v_new_revision := coalesce(v_current_revision, 0) + 1;
    update public.compute_graphs set
      schema_version = coalesce(p_schema_version, schema_version),
      graph_metadata = coalesce(p_graph_metadata, '{}'::jsonb),
      view_state = coalesce(p_view_state, '{}'::jsonb),
      revision = v_new_revision,
      updated_at = now()
    where project_id = p_project_id;
  else
    v_new_revision := 1;
    insert into public.compute_graphs (project_id, schema_version, graph_metadata, view_state, revision)
    values (
      p_project_id,
      coalesce(p_schema_version, '1'),
      coalesce(p_graph_metadata, '{}'::jsonb),
      coalesce(p_view_state, '{}'::jsonb),
      v_new_revision
    );
  end if;

  delete from public.compute_edges where project_id = p_project_id;
  delete from public.compute_nodes where project_id = p_project_id;

  for v_node in select * from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb))
  loop
    insert into public.compute_nodes (
      id, project_id, user_id, kind, label, version,
      position, size, inputs, outputs, params,
      metadata, preview, status, progress, error, is_dirty
    ) values (
      coalesce(nullif(v_node->>'id', '')::uuid, gen_random_uuid()),
      p_project_id,
      v_user_id,
      coalesce(v_node->>'kind', 'Transform'),
      coalesce(v_node->>'label', v_node->>'kind', 'Untitled Node'),
      coalesce(v_node->>'version', '1.0.0'),
      coalesce(v_node->'position', '{"x":0,"y":0}'::jsonb),
      case when v_node ? 'size' and v_node->'size' <> 'null'::jsonb then v_node->'size' else null end,
      coalesce(v_node->'inputs', '[]'::jsonb),
      coalesce(v_node->'outputs', '[]'::jsonb),
      coalesce(v_node->'params', '{}'::jsonb),
      case when v_node ? 'metadata' and v_node->'metadata' <> 'null'::jsonb then v_node->'metadata' else '{}'::jsonb end,
      case when v_node ? 'preview' and v_node->'preview' <> 'null'::jsonb then v_node->'preview' else null end,
      coalesce(v_node->>'status', 'idle'),
      coalesce((v_node->>'progress')::numeric, 0),
      nullif(v_node->>'error', ''),
      coalesce((v_node->>'isDirty')::boolean, false)
    );
  end loop;

  for v_edge in select * from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb))
  loop
    insert into public.compute_edges (
      id, project_id,
      source_node_id, source_port_id, source_handle,
      target_node_id, target_port_id, target_handle,
      data_type, status, metadata
    ) values (
      coalesce(nullif(v_edge->>'id', '')::uuid, gen_random_uuid()),
      p_project_id,
      coalesce(
        nullif(v_edge->'source'->>'nodeId', '')::uuid,
        nullif(v_edge->>'sourceNodeId', '')::uuid,
        nullif(v_edge->>'source_node_id', '')::uuid
      ),
      coalesce(v_edge->'source'->>'portId', v_edge->>'sourcePortId', v_edge->>'source_port_id', 'output'),
      coalesce(v_edge->'source'->>'handle', v_edge->>'sourceHandle', v_edge->>'source_handle', v_edge->'source'->>'portId', v_edge->>'sourcePortId', 'output'),
      coalesce(
        nullif(v_edge->'target'->>'nodeId', '')::uuid,
        nullif(v_edge->>'targetNodeId', '')::uuid,
        nullif(v_edge->>'target_node_id', '')::uuid
      ),
      coalesce(v_edge->'target'->>'portId', v_edge->>'targetPortId', v_edge->>'target_port_id', 'input'),
      coalesce(v_edge->'target'->>'handle', v_edge->>'targetHandle', v_edge->>'target_handle', v_edge->'target'->>'portId', v_edge->>'targetPortId', 'input'),
      coalesce(v_edge->>'dataType', v_edge->>'data_type', 'any'),
      coalesce(v_edge->>'status', 'idle'),
      case when v_edge ? 'metadata' and v_edge->'metadata' <> 'null'::jsonb then v_edge->'metadata' else '{}'::jsonb end
    );
  end loop;

  v_updated_at := now();

  return jsonb_build_object(
    'success', true,
    'revision', v_new_revision,
    'updated_at', v_updated_at
  );
end;
$$;

grant execute on function public.save_compute_graph(uuid, integer, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
