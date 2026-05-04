
## Problem

Two issues:

1. **"Unknown parameter: 'session.type'"** — The `session.update` payload sent on data channel open uses the beta-era format with `type: 'realtime'` and nested `audio.input/output` structure. The GA API rejects `session.type` and doesn't understand the nested audio format, so the session never gets configured with instructions/tools. Without instructions, the model defaults to whatever locale it infers (Spanish) and has no tool definitions to act on.

2. **Spanish responses + no actions** — Direct consequence of #1. Since session config is rejected, the model has no system instructions (which say "speak in short, useful lines" in English) and no tool definitions.

## Changes

### 1. Fix session config format in `src/voice/realtime/useWzrdRealtimeSession.ts` (lines 234-258)

Replace the beta-era session config with the GA format:

```ts
sessionConfig: {
  modalities: ['text', 'audio'],
  voice,
  instructions: getVoiceInstructions(),
  tools: getVoiceToolDefinitions(registryRef.current),
  tool_choice: 'auto',
  turn_detection: null,
  input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
},
```

Key changes:
- Remove `type: 'realtime'` (not a valid session parameter in GA)
- Remove `model` from session config (model is set via the WebRTC URL query param, not session.update)
- Replace `output_modalities` with `modalities: ['text', 'audio']`
- Remove nested `audio.input/output` structure — use flat `voice` at top level
- Keep `turn_detection: null` at top level for push-to-talk

### 2. Clean up `RealtimeSessionConfig` type in `src/voice/realtime/webrtcTransport.ts` (lines 30-45)

Remove the `type` and `audio` fields from the interface to match the GA API shape, preventing future regressions.

## Expected outcome

- Session config is accepted by OpenAI GA API
- Instructions (English, with tool definitions) are applied
- Model responds in English and executes `execute_worldstudio_action` tool calls
- Voice actions dispatch through the registry as designed
