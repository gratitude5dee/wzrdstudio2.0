# Worldview Deployment Guide

## Prerequisites

- Supabase CLI v2.78.1+ (`npx supabase --version`)
- Supabase access token (`supabase login` or `SUPABASE_ACCESS_TOKEN` env var)
- Project linked (`supabase link --project-ref ixkkrousepsiorwlaycp`)

---

## 1. Deploy worldlabs-proxy Edge Function

```bash
npx supabase functions deploy worldlabs-proxy
```

### Verify deployment

```bash
npx supabase functions list
```

The output should include `worldlabs-proxy` in the list of deployed functions.

### Set the WORLDLABS_API_KEY secret

```bash
npx supabase secrets set WORLDLABS_API_KEY=<your-worldlabs-api-key>
```

### Test the endpoint

A curl to the edge function without auth should return a 401 (not 500):

```bash
curl -i https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/worldlabs-proxy \
  -H "Content-Type: application/json" \
  -d '{"action": "list"}'
```

Expected: HTTP 401 with `{"error": "Missing authorization header", ...}`

---

## 2. Create worldview-takes Storage Bucket

The Supabase CLI does not support creating storage buckets directly. Create the bucket via one of these methods:

### Option A: Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/ixkkrousepsiorwlaycp/storage/buckets
2. Click **New bucket**
3. Name: `worldview-takes`
4. Toggle **Public bucket** to ON
5. Click **Create bucket**

### Option B: SQL Migration

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('worldview-takes', 'worldview-takes', true)
ON CONFLICT (id) DO NOTHING;
```

### Option C: Supabase Management API

```bash
curl -X POST https://ixkkrousepsiorwlaycp.supabase.co/storage/v1/bucket \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"id": "worldview-takes", "name": "worldview-takes", "public": true}'
```

### Fallback Behavior

If the bucket does not exist, `worldLabsService.captureTake()` will gracefully fall back to returning a data URL instead of a storage URL. This means take capture still works without the bucket — images are just embedded inline rather than stored persistently.

---

## 3. Verify fal-proxy Edge Function

The existing `fal-proxy` edge function handles all fal.ai models used by Worldview:

- `fal-ai/flux/dev` — Used by Flux Dev model and as fallback for Nano Banana
- `fal-ai/flux-pro/v1.1-ultra` — Used by Flux Pro Ultra model
- `fal-ai/omnigen-v1` — Used by OmniGen model

The `fal-proxy` accepts any `endpoint` in the request body and routes to `https://fal.run/v1/${endpoint}`, so no changes are needed.

### Nano Banana Fallback

In `src/services/worldLabsService.ts`, the `generateShot` function maps `nano-banana` to `fal-ai/flux/dev`:

```ts
const endpoint = params.model === 'nano-banana' ? 'fal-ai/flux/dev' : params.model;
```

This is already implemented and requires no additional deployment steps.

---

## Edge Function Error Handling

The `worldlabs-proxy` edge function returns proper HTTP error codes:

| Scenario | Status Code | Response |
|---|---|---|
| Missing Authorization header | 401 | `{"error": "Missing authorization header"}` |
| Invalid/expired JWT | 401 | `{"error": "Invalid authentication token"}` |
| WORLDLABS_API_KEY not set | 500 | `{"error": "WORLDLABS_API_KEY not configured"}` |
| Missing request body | 400 | `{"error": "Invalid request body"}` |
| Missing action field | 400 | `{"error": "action is required"}` |
| Unknown action | 400 | `{"error": "Unknown action: <action>"}` |
| WorldLabs API error | varies | `{"error": "WorldLabs <action> failed: <details>"}` |
