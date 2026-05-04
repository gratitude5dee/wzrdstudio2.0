## Plan

The migration file `supabase/migrations/20260503165000_repair_fal_catalog_visibility.sql` already exists in the repo. It needs to be applied to the Supabase database.

### What the migration does

1. Adds missing columns to `ai_model_catalog` (`studio_surfaces`, `kanvas_modes`, `pricing`, `is_default`, `default_rank`, etc.)
2. Updates check constraints to allow `fal_queue` transport type
3. Creates GIN and composite indexes for efficient querying
4. Upserts 8 curated Fal model defaults (Nano Banana 2, Kling Video, ElevenLabs TTS, Trellis 3D, GPT Image 2, etc.)
5. Normalizes all Fal provider variants (`fal.ai`, `fal`, `fal_ai`) to `provider = 'fal-ai'`
6. Backfills `studio_surfaces` from `media_type` so Studio dropdowns display Fal models

### Steps

1. Apply the migration SQL to the database
2. Run verification queries to confirm:
   - Fal rows exist for image/video/audio/json/3d media types
   - `fal_rows_missing_studio_surface = 0`
