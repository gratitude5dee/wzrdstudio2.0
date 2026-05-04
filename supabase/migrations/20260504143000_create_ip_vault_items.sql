CREATE TABLE IF NOT EXISTS public.ip_vault_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (
    source_type IN (
      'project_asset',
      'final_project_asset',
      'character_blueprint',
      'generation_output'
    )
  ),
  source_id uuid NOT NULL,
  asset_kind text NOT NULL DEFAULT 'asset',
  title text NOT NULL,
  description text,
  media_url text,
  thumbnail_url text,
  media_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  story_network text NOT NULL DEFAULT 'aeneid',
  registration_status text NOT NULL DEFAULT 'draft' CHECK (
    registration_status IN (
      'draft',
      'metadata_ready',
      'registering',
      'registered',
      'failed'
    )
  ),
  ip_id text,
  token_id text,
  nft_contract text,
  tx_hash text,
  story_explorer_url text,
  ip_metadata_uri text,
  ip_metadata_hash text,
  nft_metadata_uri text,
  nft_metadata_hash text,
  media_hash text,
  license_profile text NOT NULL DEFAULT 'none',
  license_terms_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  parent_ip_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  relationship_type text NOT NULL DEFAULT 'root',
  royalty_policy text,
  commercial_rev_share numeric(6, 2),
  minting_fee_wip numeric(30, 18),
  proof_packet jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_ip_vault_items_user_id
  ON public.ip_vault_items(user_id);

CREATE INDEX IF NOT EXISTS idx_ip_vault_items_project_id
  ON public.ip_vault_items(project_id);

CREATE INDEX IF NOT EXISTS idx_ip_vault_items_registration_status
  ON public.ip_vault_items(registration_status);

CREATE INDEX IF NOT EXISTS idx_ip_vault_items_story_network
  ON public.ip_vault_items(story_network);

CREATE INDEX IF NOT EXISTS idx_ip_vault_items_ip_id
  ON public.ip_vault_items(ip_id)
  WHERE ip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ip_vault_items_user_status_created
  ON public.ip_vault_items(user_id, registration_status, created_at DESC);

ALTER TABLE public.ip_vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own IP vault items"
  ON public.ip_vault_items
  FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create their own IP vault items"
  ON public.ip_vault_items
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own IP vault items"
  ON public.ip_vault_items
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own IP vault items"
  ON public.ip_vault_items
  FOR DELETE
  USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.update_ip_vault_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_ip_vault_items_updated_at ON public.ip_vault_items;
CREATE TRIGGER trigger_update_ip_vault_items_updated_at
  BEFORE UPDATE ON public.ip_vault_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ip_vault_items_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_vault_items TO authenticated;
