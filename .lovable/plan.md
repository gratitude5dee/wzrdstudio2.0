## 1. Make GMI models the preset defaults

Keep the full fal + GMI lists in the dropdowns. Only change the *initial selection* so newly created projects (and projects that haven't picked a model yet) default to GMI Cloud.

**`src/components/project-setup/TabNavigation.tsx`** (lines 214, 237)
- Image select fallback: `'gmi/seedream-5.0-lite'` (currently falls back to `imageGenerationModels[0]`, which is fal).
- Video select fallback: `'gmi/ltx-fast-i2v'`.

**`src/components/project-setup/ProjectContext.tsx`**
- Already defaults `base_image_model: 'gmi/seedream-5.0-lite'` and `base_video_model: 'gmi/ltx-fast-i2v'` on save (lines 135–136). No change needed.

**`src/components/studio/panels/SettingsPanel.tsx`** (lines 304, 313)
- Replace `modelGroups.imageModels[0]?.id` fallback with `'gmi/seedream-5.0-lite'`.
- Replace `modelGroups.videoModels[0]?.id` fallback with `'gmi/ltx-fast-i2v'`.

**`src/lib/constants/credits.ts`** (`getShotImageCredits` / `getShotVideoCredits`)
- Currently fall back to `IMAGE_MODELS[0]` / `VIDEO_MODELS[0]` (fal). Change fallbacks to look up `gmi/seedream-5.0-lite` / `gmi/ltx-fast-i2v` so credit estimates match the new preset.

No catalog edits, no schema changes, no filtering — fal models stay selectable.

## 2. Grant 1000 credits to zdhpeter@gmail.com

**Blocker:** that user does not exist in `auth.users` yet (verified via query — zero matches for `zdhpeter` or `peter`). Once they sign up, I'll insert +1000 into `user_credits.total_credits` and log a `credit_transactions` row (`transaction_type='free'`, `amount=1000`).

Options:
- **(a)** They sign up first, then I run the grant.
- **(b)** Provide a different email that already has an account.