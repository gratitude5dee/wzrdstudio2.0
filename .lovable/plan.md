
## Root cause

The `546 / WORKER_RESOURCE_LIMIT` error is from **Supabase Edge Runtime**, not GMI Cloud. Edge logs confirm: `"Memory limit exceeded"` on `asset-upload`. GMI is never reached — the worker dies before any external call.

`uploadTemplateAudio` base64-encodes the audio in the browser and sends it as JSON. The edge function then holds the base64 string + decoded `Uint8Array` + JSON parse overhead simultaneously. Even a 5MB MP3 can blow past the 150MB worker memory ceiling. This is the wrong pattern for audio.

## Fix: direct-to-Storage signed upload

Bypass the edge function for the file bytes. The browser uploads directly to the `project-assets` bucket; a tiny new edge function only registers the row in `project_assets`. The function never touches the file body, so memory stays flat regardless of size.

## Changes

### 1. New edge function: `kanvas-lyrics-audio-register`
Lightweight registration endpoint. Receives only metadata (no file bytes):
```ts
{ projectId?, storagePath, fileName, mimeType, size, durationMs?, visibility }
```
Behavior:
- `authenticateRequest` → user.id
- Verify `storagePath` starts with `lyric-audio/${user.id}/` (prevent path spoofing)
- Verify object exists in Storage (HEAD via service-role client)
- Insert into `project_assets` with `storage_bucket: 'project-assets'`, `cdn_url`, `media_metadata: { duration_ms, source: 'kanvas-lyrics' }`, `asset_category: 'template'`, `asset_type: 'audio'`
- Return `{ assetId, url }`

### 2. Rewrite `uploadTemplateAudio` in `src/features/kanvas-lyrics/service.ts`
Replace the base64 flow with:
1. Build path: `lyric-audio/${user.id}/${crypto.randomUUID()}-${safeName}`
2. `supabase.storage.from('project-assets').upload(path, file, { contentType: file.type, upsert: false })` — direct browser→Storage, no edge function in the byte path
3. Probe duration cheaply via a transient `<audio>` element + `URL.createObjectURL(file)`
4. Call `kanvas-lyrics-audio-register` with metadata only
5. Return `{ assetId, url, fileName, size, mimeType, durationMs }`

Delete `fileToBase64` and the JSON-bytes payload entirely.

### 3. Storage RLS audit for `project-assets`
Memory `Storage Project Assets Config` says folder-level RLS already exists. Verify authenticated users can `INSERT`/`SELECT` objects under `lyric-audio/{auth.uid()}/…`. Add a scoped policy only if not already covered. Bucket stays public for reads (unchanged).

### 4. Leave `asset-upload` untouched
Other studios still depend on it for small images. Refactoring it is out of scope; the lyrics flow simply stops using it.

## Files
- **New**: `supabase/functions/kanvas-lyrics-audio-register/index.ts`
- **Edit**: `src/features/kanvas-lyrics/service.ts` (rewrite `uploadTemplateAudio`, remove `fileToBase64`)
- **Migration** (conditional): RLS policy on `storage.objects` for `lyric-audio/{auth.uid()}/*` insert/select, only if audit shows it's missing

## Verification
- Upload a 10MB+ MP3 at `/kanvas/lyrics?mode=new` → no `WORKER_RESOURCE_LIMIT`
- `project_assets` row created with correct `storage_bucket`, `cdn_url`, `media_metadata.duration_ms`
- Wizard advances to Lyrics step and Gemini transcription fires against the registered asset id
- Other studios unaffected (asset-upload unchanged)

## Out of scope
- Multipart streaming refactor of `asset-upload`
- Server-side audio trimming (selection metadata remains the source of truth)
