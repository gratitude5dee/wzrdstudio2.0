
## Problem

Two issues are compounding:

1. **Build errors** — Four TypeScript errors prevent the app from compiling, blocking all functionality including voice.
2. **Voice transport race condition** — `pushToTalkStop` fires before the WebRTC transport finishes connecting (console: "pushToTalkStop skipped — transport not connected"). When the user speaks a logline and releases the push-to-talk button, the audio buffer is never committed, so the voice agent never receives the input.

## Plan

### 1. Fix build errors (4 files)

**`src/lib/referenceRegistry.ts` (lines 89-90)** — `blueprintProjectRank` expects `Pick<CharacterBlueprint, 'projectId' | 'isFavorite'>`, but `T` only has `projectId?` and `isFavorite?`. Cast through `unknown` to satisfy the compiler:
```ts
blueprintProjectRank(left as unknown as CharacterBlueprint, options)
```

**`src/pages/KanvasPage.tsx` (lines 1194, 1205)** — `resolved.references` does not exist on the return type of `resolveMentions`. Replace with `resolved.usedCharacters` and map `blueprintId` accordingly (the `usedCharacters` array contains the character data; if a `blueprintId` isn't present, derive it from the available fields or remove the mapping if unused downstream).

**`src/services/characterBlueprintService.ts` (line 347)** — The `.insert()` call wraps a single object in `as CharacterBlueprintInsert & Record<string, unknown>` but Supabase's strict typing rejects excess properties. Wrap the object in an array: `.insert([{ ... } as CharacterBlueprintInsert & Record<string, unknown>])`.

### 2. Fix voice transport race condition

**`src/voice/realtime/useWzrdRealtimeSession.ts`** — `pushToTalkStart` calls `connect()` which is async, but `pushToTalkStop` reads `transportRef.current` synchronously. If the user releases the button before `connect()` resolves, `transportRef.current` is still null.

Fix: track the in-flight connection promise in a ref. In `pushToTalkStop`, await that promise before checking transport status. Change `pushToTalkStop` from sync to async:

```ts
const connectingRef = useRef<Promise<WebRTCTransport | undefined> | null>(null);

// In pushToTalkStart:
const connectPromise = connect();
connectingRef.current = connectPromise;
const transport = transportRef.current ?? (await connectPromise);

// In pushToTalkStop:
const pushToTalkStop = useCallback(async () => {
  if (connectingRef.current) {
    await connectingRef.current;
    connectingRef.current = null;
  }
  const transport = transportRef.current;
  if (!transport || transport.status !== 'connected') {
    console.warn('[Voice] pushToTalkStop skipped — transport not connected');
    return;
  }
  transport.send({ type: 'input_audio_buffer.commit' });
  transport.send({ type: 'response.create' });
  setStatus('thinking');
}, []);
```

This ensures that if the user speaks quickly and releases before the connection is established, the audio buffer is still committed once the connection is ready.
