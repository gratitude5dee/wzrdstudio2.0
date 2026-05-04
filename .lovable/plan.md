I found that `realtime-client-secret` is now working: the browser successfully receives an `ek_...` ephemeral key from Supabase with HTTP 200. The remaining failure is happening after that, inside the browser WebRTC session with OpenAI Realtime.

The likely remaining issues are in the client session setup:

1. The current code requests microphone access, immediately stops that stream, then lets `OpenAIRealtimeWebRTC` request a second stream. That can still fail or behave inconsistently in browser permission flows.
2. The session sends `turnDetection: null`, which the installed SDK normalizes into a raw `turn_detection: null` session update. For this SDK/API combination, the safer push-to-talk path is to keep a valid turn-detection object or omit the field, while manually sending commit/response events.
3. The SDK is also trying to enable browser tracing, producing the `BatchTraceProcessor is not supported in the browser` warning. This should be disabled for the Voice session to avoid extra unsupported browser-side trace/SSE behavior.
4. The current error handler displays opaque object errors from SDK events instead of extracting nested OpenAI error messages like `service_unavailable`.

Plan:

1. Update `src/voice/realtime/useWzrdRealtimeSession.ts`
   - Keep the microphone `MediaStream` obtained from `getUserMedia` and pass it into `new OpenAIRealtimeWebRTC({ mediaStream, audioElement })` instead of stopping it and making the SDK request the mic again.
   - Track that stream in a ref and stop it only on disconnect or failed connection cleanup.
   - Add `tracingDisabled: true` to `RealtimeSession` options.
   - Remove the invalid/fragile `turnDetection: null` override and rely on the SDK/server default valid VAD configuration, while keeping the existing push-to-talk commit/response behavior.
   - Normalize SDK errors so nested realtime events such as `{ error: { type, message, details } }` become a clear user message. For `service_unavailable`, show a friendly retry message.

2. Harden push-to-talk lifecycle
   - If connection fails, close the partially-created session and release the mic stream.
   - Prevent `pushToTalkStop` from sending `commit` / `response.create` unless the session is actually connected/listening, so failed connection attempts do not trigger secondary errors.

3. Add regression coverage
   - Add a focused test for the Voice session hook if feasible in the existing Vitest setup, or extend the existing Voice button/client-secret tests to cover the new error-message normalization.
   - Ensure the new code still supports permission-denied errors with the clearer browser permission message.

4. Verification after implementation
   - Run the relevant Voice tests.
   - Check that the browser no longer logs the tracing warning from the Voice session and that the displayed Voice error is actionable if OpenAI returns temporary `service_unavailable`.