## Problem

Two related issues:

**1. Infinite 500 error loop on `/kanvas-job-status`**
Job `14d74a28-…` (model `gmi/seedream-5.0-lite`) is stuck in `processing` with `external_request_id = NULL`. The frontend polls every ~4s, the edge function throws `"Kanvas job is missing its Fal request ID."` (500), and the polling never stops. There are 2 such orphaned jobs in the DB right now.

Root cause: in `submitKanvasJob` (`supabase/functions/_shared/kanvas.ts`), when `deps.fal.submit` returns `success: true` but no `requestId` and no inline `data` (which can happen for GMI Cloud submissions that respond `200 OK` without a `request_id` — e.g., a malformed payload that the API still accepted, or a transient race), we still insert a `queued` job with `external_request_id = NULL`. The poller then 500s forever and the credit hold is never released.

**2. Slow image/video load after generation completes**
Generated assets render directly from the upstream `primaryUrl` (Fal/GMI CDN). These URLs are uncached, often slow on first hit, and lack `loading`/`decoding` hints, causing visible delay when the job flips to `completed`.

## Fix

### Backend — `supabase/functions/_shared/kanvas.ts`

1. **Fail-fast on missing requestId at submit time.** In `submitKanvasJob`, if `submission.success && !submission.requestId && !submission.data`, treat as failure: release the credit hold and throw, instead of inserting an unpollable job.

2. **Self-heal in `refreshKanvasJob` instead of 500-looping.** When `job.externalRequestId` is null:
   - Mark the job `failed` with a clear `errorMessage` (`"Generation never received a provider request ID — please retry."`).
   - Release the reserved credits.
   - Return the failed job (HTTP 200), so the client stops polling.

3. **Add `errorCode` to the failed payload** so the frontend can surface a friendly retry CTA.

### One-time data cleanup — migration

Mark the 2 currently-stuck orphan jobs as `failed` and release their holds, so the user's open tab stops looping immediately:

```sql
UPDATE generation_jobs
SET status='failed',
    progress=100,
    error_message='Generation never received a provider request ID. Please retry.',
    completed_at=now(),
    updated_at=now()
WHERE external_request_id IS NULL
  AND status IN ('queued','processing');
```

(Credit release for these two will be handled by the same self-heal path on next poll, or skipped if already past hold TTL.)

### Frontend — `KanvasPage` polling

In the Kanvas job-refresh loop:
- On a 500 from `kanvas-job-status`, increment a per-job failure counter and **stop polling after 3 consecutive failures**, marking the local job state as failed. Prevents future regressions from creating an infinite log spam loop.

### Media load performance

In the Kanvas result renderers (image grid + video preview cards):
- Add `loading="lazy"` and `decoding="async"` to result `<img>` tags (above-the-fold hero image stays eager).
- Add `preload="metadata"` and `poster={thumbnailUrl ?? previewUrl}` to result `<video>` tags so a poster paints instantly while the MP4 streams.
- Prefer `previewUrl`/`thumbnailUrl` (already in `KanvasNormalizedResult`) for grid thumbnails; only swap to `primaryUrl` on hover/click.
- Add `<link rel="preconnect">` for `fal.media` and `gmicloud.ai` CDNs in `index.html` to eliminate TLS handshake on first asset.

## Out of scope

No changes to the GMI submit/poll protocol itself or to the credit ledger schema. We're hardening the orchestration layer only.

## Files touched

- `supabase/functions/_shared/kanvas.ts` (submit guard + refresh self-heal)
- `supabase/migrations/<new>.sql` (cleanup the 2 stuck jobs)
- `src/pages/KanvasPage.tsx` and the Kanvas result card components (polling backoff + image/video hints)
- `index.html` (preconnect)
