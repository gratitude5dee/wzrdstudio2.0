
ALTER TABLE public.ip_vault_items
  ADD COLUMN IF NOT EXISTS royalty_vault_address text,
  ADD COLUMN IF NOT EXISTS last_claim_tx_hash text,
  ADD COLUMN IF NOT EXISTS last_claimed_at timestamptz;

NOTIFY pgrst, 'reload schema';
