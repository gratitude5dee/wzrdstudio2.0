## Problem

The error `Model "gpt-realtime" does not match the realtime token model` occurs because:

1. The edge function creates an ephemeral token scoped to model `gpt-4o-realtime-preview-2025-06-03`
2. The client-side code in `useWzrdRealtimeSession.ts` line 112 still defaults to `'gpt-realtime'`
3. When the WebRTC transport connects to `api.openai.com/v1/realtime?model=gpt-realtime`, OpenAI rejects it because the token was issued for a different model

## Fix

**File: `src/voice/realtime/useWzrdRealtimeSession.ts` (line 112)**

Change the default model from `'gpt-realtime'` to `'gpt-4o-realtime-preview-2025-06-03'` to match the edge function default.

```ts
// Before
const model = import.meta.env.VITE_WZRD_REALTIME_MODEL ?? 'gpt-realtime';

// After
const model = import.meta.env.VITE_WZRD_REALTIME_MODEL ?? 'gpt-4o-realtime-preview-2025-06-03';
```

One line change. No other files need modification.
