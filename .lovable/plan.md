## Fix Director's Cut 500 error

**Root cause:** The `director-cut` Edge Function selects `shots.upscaled_image_url`, but that column was never added to the database.

### Changes

1. **DB migration** (already prepared, awaiting approval): Add `upscaled_image_url TEXT` column to `public.shots`.
   ```sql
   ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS upscaled_image_url TEXT;
   ```

2. **Fix pre-existing TypeScript build error in `src/hooks/useDirectorCut.ts:154`**
   The mapper returns objects where `shotId` is optional, but the type predicate `ShotFailureInfo` requires it. Either widen the inline return type to match `ShotFailureInfo` (which has optional `shotId`), or change the predicate to a simple `Boolean` filter with explicit cast. Cleanest fix: drop the predicate and use:
   ```ts
   .filter((f): f is NonNullable<typeof f> => f !== null);
   ```

### Validation
- Reload the Director's Cut page; the 500 should be gone.
- Confirm `bun run build` passes.
