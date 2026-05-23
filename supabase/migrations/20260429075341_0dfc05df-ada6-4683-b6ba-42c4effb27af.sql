UPDATE public.generation_jobs
SET status='failed',
    progress=100,
    error_message='Generation never received a provider request ID. Please retry.',
    completed_at=now(),
    updated_at=now()
WHERE external_request_id IS NULL
  AND status IN ('queued','processing');