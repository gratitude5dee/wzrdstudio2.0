
UPDATE public.evaluation_runs
SET status = 'failed', updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"error": "Orphaned by schema constraint failure"}'::jsonb
WHERE status = 'running'
  AND created_at < now() - interval '5 minutes';
