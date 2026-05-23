UPDATE public.ai_model_catalog
SET endpoint_id = 'gpt-image-2-generate',
    aliases = ARRAY['gpt-image-2','gpt-image-2-generate'],
    defaults = '{"size":"1920x1080","quality":"medium","output_format":"png","n":1}'::jsonb,
    payload_keys = ARRAY['prompt','size','quality','n','output_format']
WHERE id = 'gmi/gpt-image-2';

NOTIFY pgrst, 'reload schema';