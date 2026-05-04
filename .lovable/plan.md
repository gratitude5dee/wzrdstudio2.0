
## Problem

The voice assistant connects and listens but never generates responses or executes tool calls. Two root causes:

1. **Missing runtime dependency**: `@openai/agents-realtime` (the package that `@openai/agents/realtime` re-exports) is not installed in `node_modules`. The lockfile references it, but it never got extracted. Even if installed, it depends on `ws` (Node.js WebSocket) which does not work in browsers.

2. **Modalities misconfiguration**: `outputModalities: ['audio']` was set to avoid an SDK error, but this prevents the model from making tool calls (which require text output). The Realtime API natively supports `modalities: ["text", "audio"]` — the SDK was just wrapping it incorrectly.

The `@openai/agents` SDK's realtime module is designed for **server-side Node.js** use. Forcing it into the browser is fragile and the source of all the SDP parsing, modality, and response failures.

## Solution

Replace the SDK-based `RealtimeSession` with a direct WebRTC connection to the OpenAI Realtime API. This is the standard browser pattern from OpenAI's own reference implementations.

### Architecture

```text
Browser
  ├── RTCPeerConnection (audio tracks for mic/speaker)
  ├── DataChannel "oai-events" (JSON events: tool calls, responses, config)
  └── Ephemeral key from existing edge function
```

### Changes

**1. New file: `src/voice/realtime/webrtcTransport.ts`**

A thin WebRTC transport class that:
- Creates an `RTCPeerConnection` with an audio track from the mic
- Sends the SDP offer to `https://api.openai.com/v1/realtime?model=MODEL` with `Authorization: Bearer <ephemeral_key>` and `Content-Type: application/sdp`
- Sets the SDP answer as remote description
- Opens a data channel (`oai-events`) for sending/receiving JSON events
- Provides `send(event)`, `on(eventType, callback)`, `close()` methods
- Configures the session via `session.update` event with `modalities: ["text", "audio"]`, `turn_detection: { type: "server_vad" }`, voice, instructions, and tool definitions

**2. Rewrite: `src/voice/realtime/useWzrdRealtimeSession.ts`**

- Remove all `@openai/agents/realtime` imports and the `RealtimeRuntime` type
- Use the new `webrtcTransport` directly
- On connect: create transport, send `session.update` with tool definitions built from the registry + agent instructions
- Handle incoming data channel events:
  - `response.audio.delta` / `response.audio.done` → speaking status
  - `response.function_call_arguments.done` → execute tool via registry, send `conversation.item.create` with tool result, then `response.create`
  - `response.done` → connected status
  - `error` → error handling (same `normalizeVoiceError` / `isBenignError` logic)
- `pushToTalkStop` sends `input_audio_buffer.commit` + `response.create` via data channel
- `disconnect` closes the `RTCPeerConnection` and stops mic tracks

**3. Update: `src/voice/agent.ts`**

Convert from creating a `RealtimeAgent` to exporting:
- `getVoiceInstructions(): string` — the system instructions
- `getVoiceToolDefinitions(registry): OpenAIToolDef[]` — tool schemas in OpenAI Realtime API format (name, description, parameters as JSON Schema)

The `z.object` schemas from the current tool definitions will be converted to JSON Schema objects for the Realtime API's `session.update` payload.

**4. Remove dependency: `@openai/agents-realtime`**

The `@openai/agents` package stays (used elsewhere), but we no longer import from `@openai/agents/realtime`.

**5. Update tests**

- Update `src/voice/agent.test.ts` for the new exports
- Update `src/components/voice/VoiceActionButton.test.tsx` if needed
- Keep existing navigation/registry tests unchanged

### Technical Details

Session configuration sent via data channel after connection:
```json
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "voice": "ash",
    "instructions": "...",
    "tools": [{ "type": "function", "name": "execute_worldstudio_action", ... }],
    "turn_detection": { "type": "server_vad" },
    "input_audio_transcription": { "model": "gpt-4o-mini-transcribe" }
  }
}
```

Tool call flow:
1. Model sends `response.function_call_arguments.done` with `call_id`, `name`, `arguments`
2. Client executes via registry, sends `conversation.item.create` with `type: "function_call_output"`, `call_id`, `output`
3. Client sends `response.create` to get the model's spoken follow-up

### Files affected
- `src/voice/realtime/webrtcTransport.ts` (new)
- `src/voice/realtime/useWzrdRealtimeSession.ts` (rewrite)
- `src/voice/agent.ts` (rewrite to export instructions + tool defs)
- `src/voice/agent.test.ts` (update)
