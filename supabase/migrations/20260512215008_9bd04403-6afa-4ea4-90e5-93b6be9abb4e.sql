-- Fix gpt-image-2-edit id to include gmi/ prefix so frontend lookup matches
UPDATE public.ai_model_catalog SET id = 'gmi/gpt-image-2-edit'
WHERE id = 'gpt-image-2-edit';

-- Insert missing catalog rows for newly added GMI models
INSERT INTO public.ai_model_catalog (id, endpoint_id, provider, provider_label, name, description, category, pricing_text, pricing, transport_type, media_type, workflow_type, ui_group, supports, payload_keys, requires_assets, defaults, controls, aliases, enabled, credits, time_label, sort_rank)
VALUES
  ('gmi/luma-uni-1.1', 'luma-uni-1.1', 'gmi-cloud', 'GMI', 'Luma Uni 1.1', 'Luma Uni 1.1 — fast text-to-image and image editing.', 'Image', '$0.001 per image', '{"usd":0.001}'::jsonb, 'request_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt','image','aspect_ratio'], ARRAY['prompt','image','aspect_ratio'], ARRAY[]::text[], '{"aspect_ratio":"1:1"}'::jsonb, '[]'::jsonb, ARRAY['luma-uni-1.1'], true, 1, '~6s', 260),
  ('gmi/veo-3.1-generate-001', 'veo-3.1-generate-001', 'gmi-cloud', 'GMI', 'Veo 3.1', 'Google Veo 3.1 video generation. $0.40/sec.', 'Video', '$0.40 per second', '{"usd":0.40}'::jsonb, 'request_queue', 'video', 'image-to-video', 'generation', ARRAY['prompt','image','lastFrame','reference_image','durationSeconds','aspectRatio','generateAudio','negativePrompt','personGeneration','seed','resolution'], ARRAY['prompt','image','lastFrame','reference_image','durationSeconds','aspectRatio','generateAudio','negativePrompt','personGeneration','seed','resolution'], ARRAY[]::text[], '{"durationSeconds":8,"aspectRatio":"16:9","generateAudio":true,"resolution":"1080p","personGeneration":"allow_all"}'::jsonb, '[]'::jsonb, ARRAY['veo-3.1-generate-001'], true, 320, '~120s', 270)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';