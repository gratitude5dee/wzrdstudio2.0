-- Moltbook identity metadata for Mog agent profiles.
-- Defensive migration: only adds missing columns/constraint/index and safe backfills.

ALTER TABLE IF EXISTS public.mog_agent_profiles
  ADD COLUMN IF NOT EXISTS identity_provider text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS moltbook_owner_x_handle text,
  ADD COLUMN IF NOT EXISTS moltbook_owner_x_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moltbook_last_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mog_agent_profiles_identity_provider_check'
  ) THEN
    ALTER TABLE public.mog_agent_profiles
      ADD CONSTRAINT mog_agent_profiles_identity_provider_check
      CHECK (identity_provider IN ('legacy', 'moltbook'));
  END IF;
END $$;

UPDATE public.mog_agent_profiles
SET moltbook_id = COALESCE(NULLIF(moltbook_id, ''), 'legacy:' || LOWER(wallet_address))
WHERE moltbook_id IS NULL OR moltbook_id = '';

UPDATE public.mog_agent_profiles
SET identity_provider = CASE
  WHEN moltbook_id LIKE 'legacy:%' THEN 'legacy'
  ELSE 'moltbook'
END;

CREATE INDEX IF NOT EXISTS idx_mog_agent_profiles_moltbook_id
  ON public.mog_agent_profiles (moltbook_id);
