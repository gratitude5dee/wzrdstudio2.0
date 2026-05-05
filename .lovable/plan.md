
# Fix Realtime Push-To-Talk Cancellation Error

## Problem
`pushToTalkStart` always calls `transport.interrupt()` which sends `response.cancel`, even when no assistant response is active. This produces repeated `response_cancel_not_active` errors. Additionally, `connect()` resolves before the data channel is open, causing dropped events.

## Changes

### 1. `src/voice/realtime/webrtcTransport.ts` — Wait for data channel open

- Add a `_dcOpenPromise` / `_dcOpenResolve` pair inside `connect()`.
- Resolve it from `dc.onopen`.
- `await` the promise at the end of `connect()` so callers know the channel is ready.
- Add a `waitUntilOpen()` public method for external use.

### 2. `src/voice/realtime/useWzrdRealtimeSession.ts` — Track response state and guard cancellation

- Add `responseActiveRef = useRef(false)` and `outputAudioActiveRef = useRef(false)`.
- Set `responseActiveRef.current = true` on `response.created`.
- Set it `false` on `response.done`, plus reset in the error handler for terminal errors.
- Set `outputAudioActiveRef.current = true` on `response.audio.delta`.
- Set it `false` on `response.audio.done` and `response.done`.
- In `pushToTalkStart`:
  - Always send `input_audio_buffer.clear`.
  - Only call `transport.interrupt()` (which sends `response.cancel`) when `responseActiveRef.current === true`.
  - Only send `output_audio_buffer.clear` when `outputAudioActiveRef.current === true`.

### 3. `src/voice/realtime/useWzrdRealtimeSession.ts` — Suppress benign race error

- In `isBenignError`, add `response_cancel_not_active` to the benign list so any remaining race doesn't flash a red error state.

## Files touched
- `src/voice/realtime/webrtcTransport.ts`
- `src/voice/realtime/useWzrdRealtimeSession.ts`

No database changes. No new dependencies.
