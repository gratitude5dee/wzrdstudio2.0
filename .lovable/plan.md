Root cause found: the installed OpenAI Agents SDK is very old (`@openai/agents@0.0.5`) and its WebRTC transport still posts SDP to `https://api.openai.com/v1/realtime` as multipart `FormData`. The current GA Realtime API expects WebRTC SDP at `/v1/realtime/calls` with `Content-Type: application/sdp`. Because the API returns a JSON 400 error instead of SDP, the browser then tries to parse that JSON as an SDP answer, producing `Failed to parse SessionDescription. { Expect line: v=`.

I will fix this by:

1. Upgrade the OpenAI Agents SDK
   - Update `@openai/agents` from `^0.0.5` to the latest compatible package version.
   - Let the lockfile refresh so `@openai/agents-realtime` uses the GA WebRTC transport that defaults to `/v1/realtime/calls` and `application/sdp`.

2. Update the client session config for GA Realtime
   - In `src/voice/realtime/useWzrdRealtimeSession.ts`, switch deprecated config fields to the newer shape:
     - `outputModalities: ['audio']` or `['text', 'audio']` as supported by the SDK
     - `audio.output.voice`
     - `audio.input.transcription`
     - `audio.input.turnDetection` with `createResponse: false` so push-to-talk can manually call `response.create` without automatic VAD responses racing it.
   - Keep the microphone stream reuse and cleanup already added.
   - Keep tracing disabled, but place it in the format the updated SDK expects.

3. Improve WebRTC failure handling
   - Detect the specific malformed-SDP/400 failure and show a clear app message such as: “Voice connection failed because the Realtime API rejected the WebRTC session. Please try again.”
   - If the SDK exposes the transport status, guard push-to-talk stop so it only sends `input_audio_buffer.commit` and `response.create` when the data channel is connected.

4. Clean up the unrelated PWA warning
   - Add `<meta name="mobile-web-app-capable" content="yes">` next to the existing Apple meta tag in `index.html`.
   - This won’t fix Voice, but it removes the console warning you pasted.

5. Validate after changes
   - Run the relevant voice tests / type checks through the available test harness.
   - Re-check the package source/lockfile to confirm the built transport now targets `/v1/realtime/calls`, not `/v1/realtime`.

Expected result: the browser receives a real SDP answer instead of a JSON 400 body, so `setRemoteDescription` should no longer fail with `Expect line: v=`. The `BatchTraceProcessor` warning should also disappear once the newer SDK + disabled tracing config are in place.