## Problem

The `realtime-client-secret` edge function creates a session token with model `"gpt-realtime"` (from env `WZRD_REALTIME_MODEL`), but the client in `useWzrdRealtimeSession.ts` connects using a hardcoded `"gpt-4o-realtime-preview-2025-06-03"`. OpenAI rejects the connection because the model in the WebRTC connect call doesn't match the model baked into the ephemeral token.

## Fix

### 1. `src/voice/realtime/realtimeClientSecret.ts`
- Update `fetchRealtimeClientSecret` to return both the ephemeral key **and** the model from the session response (the OpenAI response includes a `model` field).
- Add a helper `extractRealtimeModel` to pull the model string from the payload.

### 2. `src/voice/realtime/useWzrdRealtimeSession.ts`
- Use the model returned from `fetchRealtimeClientSecret` instead of the hardcoded `gpt-4o-realtime-preview-2025-06-03`.
- Fall back to the env var / default only if the response doesn't include a model.

No edge function changes or redeployment needed.
