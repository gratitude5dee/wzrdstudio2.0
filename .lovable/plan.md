## Fix Director's Cut FAL compose 422 (id + keyframes required)

### Root cause

FAL's actual `fal-ai/ffmpeg-api/compose` schema (per the 422 response body) requires each track to have:
- `id: string`
- `keyframes: [{ url, timestamp, duration, ... }]`

The previous fix flattened tracks to `{ type, url, start, end, x, y, width, height }` based on a docs snippet that did not match the live endpoint. FAL rejects every compose call with:

```
missing: body.tracks[i].id
missing: body.tracks[i].keyframes
```

Editframe fallback is also unconfigured (`EDITFRAME_API_KEY` missing), so the whole job dies.

### Changes

1. **Rewrite `buildFalTracks()`** in `supabase/functions/_shared/export-helpers.ts` to emit FAL's documented shape:
   ```ts
   {
     id: string,                   // stable per-track id
     type: 'video' | 'image' | 'audio',
     keyframes: [{
       url: string,
       timestamp: number,          // ms
       duration: number,           // ms
       x?: 0, y?: 0,
       width?: canvas.width,
       height?: canvas.height,
     }]
   }
   ```
   - Visual tracks: one keyframe per asset, with x/y/width/height.
   - Audio tracks: one keyframe per asset, no geometry.
   - `id` = `track-${index}` or asset id.

2. **Update `runWithFal` compose call** to send the canvas envelope FAL accepts alongside the new tracks:
   ```ts
   { tracks, output_format: 'mp4', resolution: { width, height }, fps }
   ```
   Drop `duration_seconds` (compose derives it from keyframes; 422 didn't mention it but `start/end` were never valid here).

3. **Keep richer FAL error surfacing** already added (`falGetResult` includes response body) — no change needed beyond what's in place.

4. **Out of scope:** Editframe fallback secret and missing-shot UX banner — track separately. The compose fix alone unblocks current exports since 2 of 14 shots have media.

### Validation

Re-run the export (`/projects/1f37efc1.../directors-cut`) and confirm:
- `provider_payload` no longer logs the `missing id/keyframes` 422.
- A `final_video_url` is produced from the 3 available visuals.

### Files touched

- `supabase/functions/_shared/export-helpers.ts` — `FalComposeTrack` interface, `buildFalTracks()`, `runWithFal()` compose input.
