The edge function URL fix is working — the network trace shows a successful `200` response with a valid ephemeral key (`ek_...`). The "Permission denied" error is coming from the browser denying **microphone access** when `OpenAIRealtimeWebRTC` tries to capture audio.

## Fix

Update `src/voice/realtime/useWzrdRealtimeSession.ts` to:

1. **Request microphone permission explicitly** before calling `session.connect()`, so the error is caught cleanly instead of buried inside the WebRTC transport.
2. **Detect permission errors** in the catch block and show a user-friendly message like "Microphone access denied — please allow microphone permission and try again."

### Changes in `useWzrdRealtimeSession.ts`

- Add `await navigator.mediaDevices.getUserMedia({ audio: true })` before the `session.connect()` call (around line 67, before loading the runtime or right after). Release the stream immediately — OpenAIRealtimeWebRTC will request its own.
- In the `catch` block (lines 108-112), detect `Permission denied` / `NotAllowedError` and set a clear error message.

This is a 1-file, ~10-line change.