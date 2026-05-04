
## Problems Identified

1. **Modalities error**: The session config sends `outputModalities: ['text', 'audio']` but the Realtime API only accepts `['text']` or `['audio']` — not both. This causes the `invalid_request_error` seen in console, which likely breaks tool call responses (navigation fails because the session is in an error state).

2. **No way to disconnect**: The VoiceActionButton is push-to-talk only. Clicking it again just starts another PTT cycle — there's no toggle to close the session and stop credit usage.

3. **No cleanup on page navigation**: The `useEffect` cleanup in `useWzrdRealtimeSession` only fires on unmount, but `VoiceAgentProvider` wraps the entire app and never unmounts during navigation. There's no `beforeunload` handler for tab close.

## Plan

### 1. Fix modalities config (`useWzrdRealtimeSession.ts`)
- Change `outputModalities: ['text', 'audio']` to `outputModalities: ['audio']` — the agent needs to speak responses and can still call tools.

### 2. Add disconnect-on-click behavior (`VoiceActionButton.tsx` + `VoiceAgentProvider.tsx`)
- Pass `onDisconnect` to VoiceActionButton.
- When session is active (not idle/error) and user taps without holding (short press or single click without drag), disconnect the session.
- Add a visual indicator (e.g., pulsing dot) when connected but idle to show the session is active.

### 3. Add `beforeunload` cleanup (`useWzrdRealtimeSession.ts`)
- Add a `window.addEventListener('beforeunload', disconnect)` effect so closing/refreshing the tab properly tears down the WebRTC session.

### 4. Suppress empty-buffer commit errors
- In `pushToTalkStop`, the `input_audio_buffer_commit_empty` error fires because very short presses send no audio. Filter this specific error in the error handler so it doesn't show as a session error — just silently reset to idle.

### Files to Edit
- `src/voice/realtime/useWzrdRealtimeSession.ts` — fix modalities, add beforeunload, expose disconnect
- `src/components/voice/VoiceActionButton.tsx` — add disconnect toggle behavior
- `src/voice/VoiceAgentProvider.tsx` — pass disconnect handler to button
