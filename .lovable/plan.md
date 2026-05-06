
# IP Vault Dashboard Overhaul

## Overview
Transform the existing 586-line monolithic `IPVaultPage.tsx` into a polished, modular creator rights command center with summary metrics, a searchable gallery, and a tabbed inspector panel — all using the existing Supabase schema, service layer, and Story SDK integration.

## 1. Database Migration (optional columns)

Add nullable columns to `ip_vault_items` for first-class royalty/claim tracking:

```sql
ALTER TABLE public.ip_vault_items
  ADD COLUMN IF NOT EXISTS royalty_vault_address text,
  ADD COLUMN IF NOT EXISTS last_claim_tx_hash text,
  ADD COLUMN IF NOT EXISTS last_claimed_at timestamptz;
```

Include `NOTIFY pgrst, 'reload schema';` per project convention. No RLS changes needed — existing policies cover all CRUD by `user_id`.

## 2. Type & Service Updates

- Add `royalty_vault_address`, `last_claim_tx_hash`, `last_claimed_at` to `IPVaultItem` type
- Update `normalizeVaultRow` in `ipVaultService.ts` for new columns
- Update `persistRegistration` to store `royalty_vault_address` from registration result
- Update `handleClaimRevenue` flow to persist `last_claim_tx_hash` and `last_claimed_at` after successful claim
- Add a `getClaimableRevenue` helper in `src/lib/story/registration.ts` using `client.royalty.claimableRevenue` (best-effort, catches errors gracefully)

## 3. Component Architecture

Decompose into focused components:

```text
src/components/ip-vault/
  IPVaultPage.tsx              (shell: state management, layout grid)
  IPVaultSummary.tsx           (top metrics bar)
  IPVaultGallery.tsx           (search + filter + card grid)
  IPVaultInspector.tsx         (tabbed detail panel wrapper)
  tabs/
    IPVaultOverviewTab.tsx     (media preview, status, IDs, links)
    IPVaultRegistrationTab.tsx (7-step checklist, pin/register actions)
    IPVaultLicensingTab.tsx    (license profile cards, commercial fields)
    IPVaultDerivativesTab.tsx  (relationship type, parent selector, warnings)
    IPVaultRoyaltiesTab.tsx    (royalty policy, vault address, claim button)
    IPVaultProofTab.tsx        (proof fields, copy buttons, collapsible JSON)
  IPVaultVoiceBridge.tsx       (unchanged)
  FinalizeAssetDialog.tsx      (unchanged)
```

`IPVaultPage` remains the single state owner — all child components receive data and callbacks via props. No new stores.

## 4. Summary Metrics (`IPVaultSummary`)

Horizontal row of stat cards:
- Total finalized assets
- Metadata-ready count
- Registered IP count
- Failed registrations
- Wallet status (connected address + Aeneid badge)

Dark card style with `bg-white/[0.03]`, `border-white/[0.08]`, orange accent for registered count.

## 5. Gallery (`IPVaultGallery`)

Keep existing search/filter bar. Improvements:
- Add "registering" to the status filter dropdown
- Cards show: media preview, status badge, license profile badge, shortened IP ID
- Selected card has orange border highlight (existing pattern)

## 6. Tabbed Inspector (`IPVaultInspector`)

Pill-Slider tab switcher (matching project pattern from `mem://style/ui-patterns-kanvas-tabs`) with six tabs:

### Overview Tab
- Large media preview
- Status badge, title, description
- Source type and asset kind badges
- Copy buttons for: IP ID, Token ID, NFT contract, tx hash
- StoryScan link, IPFS metadata links

### Registration Tab
- 7-step checklist with lime/gray indicators:
  1. Finalized source exists (always true)
  2. Metadata pinned to IPFS
  3. Wallet connected
  4. Wallet on Story Aeneid
  5. License configured (not "none")
  6. Transaction submitted
  7. Registered on Story
- Pin metadata button, Register IP button (orange primary)
- Switch network button when needed
- Disabled reasons shown as text (not silently disabled)
- Error display from `proof_packet.registrationError` for failed items

### Licensing Tab
- License profiles as visual option cards (replacing dropdown) with descriptions:
  - No public license — private/controlled rights
  - Non-commercial remix — Story licenseTermsId 1; not re-registered
  - Commercial use — paid commercial, no derivatives
  - Commercial remix — commercial + derivatives with rev share
  - CC BY — attribution-friendly public
- Commercial fields: minting fee (WIP, validated >= 0), rev share % (validated 0-100)
- Royalty policy selector: LAP vs LRP (for commercial profiles)
- Post-registration: fields become read-only with explanation text

### Derivatives Tab
- Relationship type selector: Root, Derivative, Remix, Adaptation
- When not root: parent IP selector from registered vault items (title + shortened IP ID)
- License terms ID display
- Warning banner when derivative is selected but missing parent data
- Read-only after registration

### Royalties Tab
- Only active for registered items; shows disabled explanation otherwise
- Royalty policy (LAP/LRP) display
- Royalty vault address from `royalty_vault_address` column or `proof_packet.story.royaltyVaultAddress`
- Commercial rev share display
- Child IP IDs from `proof_packet.childIpIds`
- Claim revenue button with loading state
- Best-effort claimable revenue preview via SDK (catches errors, shows "unknown" if unavailable)

### Proof Tab
- Immutable-feeling read-only display:
  - Source type, source ID, project ID
  - Media URL, thumbnail URL
  - Media hash, IP metadata URI/hash, NFT metadata URI/hash
  - Registration tx hash, registered/failed timestamps
  - Error message if failed
- Copy buttons for all hash/URI/ID fields
- Collapsible raw JSON proof packet viewer

## 7. Shared Utilities

- `CopyButton` component: small icon button that copies to clipboard with toast feedback
- Reuse existing `statusClass`, `formatIp`, `previewUrl` helpers (move to shared file)

## 8. Tests

Update `IPVaultPage.test.tsx` and add coverage for:
- Empty vault renders correctly with summary showing zeros
- Summary metrics show correct counts for mixed-status items
- Selecting an item updates the inspector
- Tab switching renders correct content
- Registration button disabled without wallet (shows reason text)
- Metadata-ready item shows "Pinned" status
- Registered item shows StoryScan and IPFS links
- License profile card selection calls `ipVaultService.updateRights`
- Commercial remix validates rev share (0-100) and mint fee (>= 0)
- Derivative mode requires parent IP and license terms (warning shown)
- Claim revenue disabled until item is registered

## 9. Styling

- All dark theme: `bg-[#08080b]`, `bg-[#0d0d12]`, `border-white/[0.08]`, orange `#f97316` accent
- Pill-Slider tabs matching existing WZRD pattern
- lucide-react icons throughout
- shadcn/ui controls (Button, Badge, Input, Select, Label, Separator, Collapsible)
- Responsive: stacked layout on mobile, `xl:grid-cols-[1fr_420px]` on desktop
- 44px minimum touch targets for mobile

## Technical Constraints
- No new Zustand stores — state lives in `IPVaultPage`
- Voice bridge interface unchanged — props pass through
- Browser wallet only — no backend private keys
- Story Aeneid testnet
- `commercialRevShare: 5` means 5% (human percentage)
- Derivative registration uses `maxRts: 100_000_000`
- No Multicall3 with SPG flows
- `STORY_DEFAULT_SPG_NFT_CONTRACT` preserved
- Existing `ipVaultService` methods preserved and reused
