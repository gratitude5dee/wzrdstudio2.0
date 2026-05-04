
## Problem

The error "API version mismatch. You cannot start a Realtime beta session with a GA client secret" occurs because:

1. The `realtime-client-secret` edge function creates a **GA** ephemeral key (via `/v1/realtime/client_secrets` without a beta header)
2. But it uses a beta-era request body format (`session.type: "realtime"`, nested `audio.output.voice`, `expires_after`) and the model name `gpt-realtime` which doesn't exist in GA
3. The client-side model default is also wrong (`gpt-4o-realtime-preview-2025-06-03` may not match what the ephemeral key was scoped to)

## Fix

**1. Edge function: `supabase/functions/realtime-client-secret/index.ts`**

Update the request body to match the GA `/v1/realtime/client_secrets` format:
- Change default model from `"gpt-realtime"` to `"gpt-4o-realtime-preview-2025-06-03"`
- Simplify request body to GA format: `{ model, voice }` (no `session` wrapper, no `type`, no `expires_after`)

**2. Client: `src/voice/realtime/useWzrdRealtimeSession.ts`**

- Change default model from `gpt-4o-realtime-preview-2025-06-03` to match the edge function default (they must agree)

**3. Deploy the edge function**

## Files
- `supabase/functions/realtime-client-secret/index.ts`
- `src/voice/realtime/useWzrdRealtimeSession.ts` (model default alignment)
