ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS custom_meta_prompts jsonb DEFAULT NULL;
NOTIFY pgrst, 'reload schema';