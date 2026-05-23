
ALTER TABLE public.evaluation_results ALTER COLUMN test_id DROP NOT NULL;
ALTER TABLE public.evaluation_results ALTER COLUMN model_id DROP NOT NULL;

-- Set sensible defaults for future inserts
ALTER TABLE public.evaluation_results ALTER COLUMN test_id SET DEFAULT 'shadow';
ALTER TABLE public.evaluation_results ALTER COLUMN model_id SET DEFAULT 'shadow-evaluator';

NOTIFY pgrst, 'reload schema';
