
-- Fix evaluation_runs schema drift: drop old NOT NULL constraints
ALTER TABLE public.evaluation_runs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.evaluation_runs ALTER COLUMN models SET DEFAULT '{}'::text[];
ALTER TABLE public.evaluation_runs ALTER COLUMN models DROP NOT NULL;
ALTER TABLE public.evaluation_runs ALTER COLUMN tests SET DEFAULT '{}'::text[];
ALTER TABLE public.evaluation_runs ALTER COLUMN tests DROP NOT NULL;

-- Fix status default
ALTER TABLE public.evaluation_runs ALTER COLUMN status SET DEFAULT 'queued';

-- Fix mode check constraint to allow new values
ALTER TABLE public.evaluation_runs DROP CONSTRAINT IF EXISTS evaluation_runs_mode_check;
ALTER TABLE public.evaluation_runs ADD CONSTRAINT evaluation_runs_mode_check
  CHECK (mode IS NULL OR mode IN ('off', 'shadow', 'soft_gate', 'hard_gate', 'text-to-image'));

-- Fix status check constraint
ALTER TABLE public.evaluation_runs DROP CONSTRAINT IF EXISTS evaluation_runs_status_check;
ALTER TABLE public.evaluation_runs ADD CONSTRAINT evaluation_runs_status_check
  CHECK (status IS NULL OR status IN ('queued', 'running', 'completed', 'failed', 'pending'));

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
