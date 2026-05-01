
## Goal

Replace the fake export flow (which just saves a database row pointing to the first clip's URL) with a real client-side video renderer that composites background clips + lyrics overlay + audio into a downloadable video file.

## Approach: Client-Side Canvas Recorder

Since this is a client-side app with no Node.js server, we'll render the video in the browser using:
1. **Canvas rendering**: Draw each frame (video clips + lyric text) onto a `<canvas>`
2. **MediaRecorder**: Capture the canvas stream + audio into a WebM file
3. **Real-time playback**: Run at 1x speed so audio stays in sync via Web Audio API

This produces a proper video with all clips, lyrics, and audio synced. Quality is good (8Mbps WebM/VP9), though not quite Remotion CLI quality.

## New Files

### `src/features/remix/canvasExporter.ts`

Core export engine:
- `exportRemixVideo(opts)` — async function returning a `Blob`
- Takes same props as `LyricRemixComposition` (clips, captions, style, cut markers, audio)
- **Video pipeline**: Preloads all clip `<video>` elements, seeks to the correct offset per frame, draws to canvas with `drawImage()` using cover-fit crop math
- **Lyrics pipeline**: Mirrors `LyricRemixComposition`'s text rendering using Canvas 2D API (`fillText`, `strokeText`) with style-specific fonts, colors, accent words, stroke, background rectangles, and scale animation
- **Audio pipeline**: Loads audio via `HTMLAudioElement`, routes through `AudioContext` → `MediaStreamAudioDestinationNode`, adds the audio track to the canvas MediaStream
- **Recording**: Uses `MediaRecorder` with VP9+Opus codec (fallback to VP8), 8Mbps bitrate
- **Timing**: Real-time frame pacing via `performance.now()` + `setTimeout` so audio stays in sync
- Supports `onProgress(0-1)` callback and `AbortSignal` for cancellation
- Cleans up all video elements, audio context on completion

### `src/features/remix/ExportModal.tsx`

Recording progress UI:
- Full-screen overlay with progress bar
- Shows "Recording... X%" with a cancel button
- Calls `exportRemixVideo()` with composition parameters
- On completion, creates a download link and triggers `<a>.click()` download
- Handles errors gracefully with toast notifications

## Modified Files

### `src/pages/KanvasRemix.tsx`

- Replace `startExport` → `createRemixJob` flow with the new canvas export
- Add `exportModalOpen` state and `ExportModal` component
- The confirm modal's "Confirm" button now opens `ExportModal` instead of calling `createRemixJob`
- Credit deduction still runs before export starts (extracted from `createRemixJob` into a standalone function)
- After successful export, optionally still saves a job record for history

### `src/features/remix/service.ts`

- Extract credit deduction into a standalone `deductRemixCredits(durationMs, quantity)` function so the page can call it independently of job creation
- Keep `createRemixJob` for job history tracking but mark renders with the actual output blob URL (using `URL.createObjectURL`)

## Key Technical Details

**Canvas video drawing**: For each frame, find the active clip segment (based on cut marker boundaries), seek the `<video>` element to the correct offset within that segment, then `drawImage()` with cover-fit crop:
```ts
const videoAR = vw / vh;
const canvasAR = width / height;
// Crop to cover
if (videoAR > canvasAR) { sw = vh * canvasAR; sx = (vw - sw) / 2; }
else { sh = vw / canvasAR; sy = (vh - sh) / 2; }
ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, width, height);
```

**Lyrics rendering**: Uses `ctx.font`, `ctx.fillText`, `ctx.strokeText` with the same style properties from `getLyricStyle()`. The enter animation scale uses the same `lerp(0.86, 1, t)` formula. Style transforms (skewX, rotate) are applied via `ctx.transform()`.

**Audio sync**: Plays `HTMLAudioElement` at real-time speed while recording. The audio stream is connected to `MediaStreamAudioDestinationNode` and added to the canvas `MediaStream`, so MediaRecorder captures both video and audio tracks together.

**Frame pacing**: Each frame targets `startTime + frame * (1000/fps)` using `performance.now()`. If rendering finishes early, we `setTimeout` to wait. If it falls behind, we skip the wait (audio stays in sync because it plays independently).

## Output Format

WebM with VP9 video + Opus audio. Most browsers support this natively. The download filename follows the pattern `kanvas-remix-{templateTitle}.webm`.
