
# Fix Voice Concept Display + Character Image Generation (via fal.ai)

## Issue 1: Voice concept not appearing in the textarea

The console shows `Unknown parameter: 'response.output_modalities'` from `webrtcTransport.ts:sendOutOfBandAudio()`. This error disrupts the Realtime session and may prevent tool calls from completing, so the concept never reaches the textarea.

**Fix:** Remove `output_modalities` from the `response.create` payload in `sendOutOfBandAudio` (line 95 of `webrtcTransport.ts`). The session-level `modalities: ['text', 'audio']` already handles this.

## Issue 2: Character image generation failing — switch from GMI to fal.ai

The edge function `generate-character-image` currently uses GMI Cloud (`executeGmiQueueModel`) which fails with `model nanobanana-2 does not exist`. The user wants to use **fal.ai** with `fal-ai/nano-banana-2` instead.

**Fix:** Rewrite `generate-character-image/index.ts` to use `executeFalModel` and `pollFalStatus` from `_shared/falai-client.ts` instead of `executeGmiQueueModel`/`pollGmiQueueStatus`. Remove the `image-fallback.ts` resolver (not needed when we're hardcoding to fal nano-banana-2). Remove the GMI imports entirely.

### Changes to `generate-character-image/index.ts`:
- Replace GMI imports with fal imports: `executeFalModel`, `pollFalStatus` from `falai-client.ts`
- Keep the visual prompt generation step via GMI (`executeGmiChatCompletion` for text LLM is fine)
- Replace the image generation step: use `executeFalModel('fal-ai/nano-banana-2', { prompt, image_size: { width: 1024, height: 1024 } }, 'queue')` 
- Poll with `pollFalStatus` using the returned `requestId` and `statusUrl`
- Extract the image URL from the fal response (`data.result?.images?.[0]?.url` or similar)
- Remove the `resolveImageGenerationPlan` import and usage

## Files to change

1. **`src/voice/realtime/webrtcTransport.ts`** — Remove `output_modalities: ['audio']` from `sendOutOfBandAudio`.

2. **`supabase/functions/generate-character-image/index.ts`** — Switch image generation from GMI Cloud to fal.ai `fal-ai/nano-banana-2`.

3. Redeploy `generate-character-image` edge function.
