
# Fix Remix Clip Playback and Video Export

Two issues to fix: (1) clips don't play back in the Remotion preview, and (2) the canvas-based video export produces broken output.

---

## Problem 1: Clips Don't Play in the Preview

The Remotion `<Video>` component in `LyricRemixComposition.tsx` receives `backgroundClips` from the timeline slots. However, **timeline slots start with `clipId: null`** (no clips assigned). The `backgroundClips` array in `KanvasRemix.tsx` (line 163) uses a fallback to `assets[0]`, but if assets haven't loaded yet or the timing is off, clips may be empty.

Additionally, the `<Video>` component uses `muted` but the clips are local files (`/clips/bay-area-vhs-*.mp4`) that should work. The real issue is likely:
- Slots aren't auto-populated on load — user must manually shuffle or drag clips
- The `backgroundClips` fallback logic only fills slots when `assets[0]` exists, but the composition may render before assets load

**Fix**: Auto-populate timeline slots with shuffled clips when assets first load, so the preview has content immediately.

## Problem 2: Video Export Produces Broken Output

The canvas exporter (`canvasExporter.ts`) uses a frame-by-frame approach with `seekVideo()` per frame. This is fundamentally fragile because:
- Seeking a video element 30 times per second to exact timestamps is slow and unreliable
- The `requestFrame()` on `CanvasCaptureMediaStreamTrack` may not capture properly at this rate
- CORS issues with local video elements created via `document.createElement('video')`

**Fix**: Replace the seek-per-frame approach with a real-time playback recording approach:
- Play each video clip segment naturally (using `video.play()` + `video.currentTime` for start offset)
- Use `requestAnimationFrame` loop to draw the currently-playing video onto the canvas
- This avoids the unreliable frame-by-frame seeking

---

## Implementation Plan

### Step 1: Auto-populate clips on load (`KanvasRemix.tsx`)

Add an effect that auto-fills empty timeline slots with shuffled assets when both `timelineSlots` and `assets` are available and all slots are empty:

```typescript
useEffect(() => {
  if (assets.length === 0 || timelineSlots.length === 0) return;
  const allEmpty = timelineSlots.every(s => s.clipId === null);
  if (!allEmpty) return;
  const shuffled = seededShuffle(assets, Date.now());
  setTimelineSlots(prev =>
    prev.map((slot, i) => ({
      ...slot,
      clipId: shuffled[i % shuffled.length]?.id ?? null,
    }))
  );
}, [assets, timelineSlots.length]);
```

### Step 2: Fix the canvas exporter (`canvasExporter.ts`)

Rewrite the render loop to use real-time video playback instead of per-frame seeking:

1. For each clip segment, set `video.currentTime` to 0 and call `video.play()`
2. Use a `requestAnimationFrame`-based loop that draws the playing video onto the canvas each frame
3. Synchronize with `performance.now()` for accurate timing
4. Draw lyric overlays on top using the existing canvas text rendering logic
5. Keep the `MediaRecorder` + `captureStream(0)` + `requestFrame()` approach for recording

Key changes:
- Replace the `for (frame...)` loop with a `requestAnimationFrame` loop
- Track elapsed time with `performance.now()` instead of frame counting
- Play video elements naturally instead of seeking per frame
- Pre-seek each clip to the right start time before the segment begins

### Step 3: Handle edge cases

- Ensure CORS headers work for local clips by keeping `crossOrigin = 'anonymous'`
- Add error handling for when clips fail to load (skip segment, show black)
- Handle the case where the export modal is closed mid-export (abort signal)

---

## Files to Change

| File | Change |
|------|--------|
| `src/pages/KanvasRemix.tsx` | Add auto-populate effect for timeline slots |
| `src/features/remix/canvasExporter.ts` | Rewrite render loop to use real-time playback |
