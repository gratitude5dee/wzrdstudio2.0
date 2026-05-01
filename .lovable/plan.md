## Raise audio upload size cap to 50MB

Users hit a 20MB upload limit when uploading audio for Kanvas Lyrics templates. The backend (`asset-upload` edge function) and frontend code already permit larger files — the bottleneck is the **Supabase Storage bucket's `file_size_limit`**, which is currently `NULL` and therefore inherits the platform default (~20MB on the current plan). We'll override it explicitly per bucket.

### Changes

**1. Database migration — set per-bucket limit to 50MB**

```sql
UPDATE storage.buckets
SET file_size_limit = 52428800  -- 50 MB in bytes
WHERE id IN ('project-assets', 'audio');
```

This affects only the two buckets used for audio/template assets. No table schema or RLS changes.

**2. Frontend copy update**

`src/components/kanvas-lyrics/AudioPanel.tsx` line 112 — change the hint text from "up to 100MB" to "up to 50MB" so the displayed limit matches the enforced limit.

### Why 50MB

- 50MB comfortably covers a 60-second clip even at WAV/lossless quality (and many full-length MP3/M4A tracks).
- Keeps uploads snappy on typical residential uplinks (~30s–2min on 5–15 Mbps).
- The `asset-upload` edge function still enforces its own 100MB ceiling, so this change is the sole gate.

### Files touched

Created
- `supabase/migrations/<timestamp>_raise_audio_upload_limit_50mb.sql`

Edited
- `src/components/kanvas-lyrics/AudioPanel.tsx` (one-line copy change)

### QA

- Re-attempt the previously failing audio upload (>20MB, ≤50MB) — should succeed.
- Files >50MB should be rejected by storage with a clear error before hitting the network for the full payload.

Approve to apply.