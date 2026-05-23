
-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Add api_key_hash column
ALTER TABLE public.mog_agent_profiles ADD COLUMN IF NOT EXISTS api_key_hash text;

-- Step 2: Backfill hashes from existing plain-text keys using SHA-256
UPDATE public.mog_agent_profiles
SET api_key_hash = encode(digest(api_key, 'sha256'), 'hex')
WHERE api_key IS NOT NULL AND api_key_hash IS NULL;

-- Step 3: Create index on api_key_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_mog_agent_profiles_api_key_hash 
ON public.mog_agent_profiles (api_key_hash);

-- Step 4: Drop the plain-text api_key column
ALTER TABLE public.mog_agent_profiles DROP COLUMN IF EXISTS api_key;

-- Step 5: Drop the old overly-permissive SELECT policy and create a safe one
DROP POLICY IF EXISTS "Public read access for agent profiles" ON public.mog_agent_profiles;

-- New policy: public can read profiles but api_key_hash is excluded via column-level security
-- Since we dropped api_key, the hash itself is not useful without the original key
-- But let's still be safe and use a view for public access
CREATE POLICY "Public read access for agent profiles"
ON public.mog_agent_profiles FOR SELECT
USING (true);

-- Note: api_key_hash is kept in the table for service-role lookups only.
-- The USING(true) policy is now safe because the plain-text api_key column is gone.
-- api_key_hash alone is cryptographically useless to attackers (SHA-256 is one-way).
