
## Goal

Use the template's cut markers as edit points that define when clips switch in both the timeline UI and the Remotion preview/export. Currently, cut markers are only displayed as visual ticks and white flash overlays — they don't control clip timing.

## Changes

### 1. `src/lib/remix-utils.ts` — `buildRemixTimelineSlots`

Rewrite to split the duration at cut marker boundaries instead of fixed 1-second slots. Each segment between consecutive markers (including 0 and durationMs as implicit boundaries) becomes one timeline slot. If no markers exist, fall back to a single slot spanning the full duration.

### 2. `src/components/remix/LyricRemixComposition.tsx` — `getClipSequence`

Replace the current logic (which loops clips by their native duration) with cut-marker-driven sequencing:

- Derive segment boundaries from `cutMarkers` + `durationMs` (same logic as the slot builder: `[0, ...markers, durationMs]`).
- Each segment gets one clip from `backgroundClips` (cycling if fewer clips than segments).
- Each Remotion `<Sequence>` starts at the segment's `fromMs` and lasts until the next boundary.

This ensures the preview player switches clips exactly at cut marker timestamps.

### 3. `src/pages/KanvasRemix.tsx` — `backgroundClips` memo

Update the `backgroundClips` memo to produce one clip per timeline slot (matched by slot order), so the composition receives clips aligned 1:1 with cut-marker segments. Currently it just collects filled clips without regard to slot position — empty slots should pass `null` or a fallback so the composition can handle gaps.

### 4. `src/features/remix/types.ts` — No changes needed

`RemixTimelineSlot` already has `startMs`/`endMs` which will naturally hold marker-derived boundaries.

## Behavior After Changes

- Template with cut markers at [3200, 7800, 11500] on a 15s clip produces 4 timeline slots: 0–3200ms, 3200–7800ms, 7800–11500ms, 11500–15000ms.
- Dragging/clicking a clip into slot 2 means that clip plays from 3.2s to 7.8s in the Remotion preview.
- The white flash overlay on cut markers is preserved (controlled by `noCuts` toggle).
- Export sends `timelineClipIds` aligned to these marker-derived slots.
