
# Kanvas Lyrics + Remix Editor Overhaul

This is a large implementation spanning ~15 files. Breaking it into two phases executed sequentially.

---

## Phase 1: Lyrics Template Wizard (3-panel layout)

### 1.1 Remove VisualizePanel, merge into MarkersPanel

- Delete the separate `VisualizePanel` component and the `currentStep === 4` section in `KanvasLyrics.tsx`.
- Remove step 4 from `WizardStep` type (make it `1 | 2 | 3`).
- Move the lyric preview display (active word caption, CUT/KEEP flash) into `MarkersPanel` as the large preview stage area shown in the screenshot — a dark rectangle with a play button overlay and skip-to-start button.
- Add the shortcut chip row matching the screenshot: `Space play`, `M cut`, `⌘Z undo`, `Del remove`.
- Add undo/redo icon buttons and a `clear` action next to the marker count.
- Add `Delete` key handler to remove the nearest marker within 300ms of the playhead.
- Add proper undo/redo stack (array of marker snapshots) instead of just popping the last marker.
- Markers snap to 50ms and dedupe within 250ms (already in `remix-utils`, wire it into the add handler).

### 1.2 Restyle Audio and Lyrics panels

- Audio panel: cyan/emerald accent states, "15s selected" subtitle when confirmed, dark card styling to match screenshot.
- Lyrics panel: centered "Lyrics Transcribed" success state with checkmark, "READY FOR PREVIEW" badge, compact "Edit lyrics" affordance.
- Both panels use the WizardPanel wrapper with green checkmark icons when complete.

### 1.3 Update footer and save behavior

- `SAVE TEMPLATE` button in footer is enabled once audio is confirmed AND lyrics exist (markers are optional).
- Remove the step-4-gated save — save is available from step 2 onward when conditions are met.
- Footer shows `15.0s`, word count, and the save button.
- Update `KanvasLyricsFooter` props accordingly.

### 1.4 Update types

- `WizardStep` becomes `1 | 2 | 3`.
- `AppState` drops `'visualize'` value.
- Update `stepFromStatus` mapping.

---

## Phase 2: Remix Editor Upgrade

### 2.1 Timeline data model

Add to `src/features/remix/types.ts`:
```typescript
interface RemixTimelineSlot {
  slotIndex: number;
  startMs: number;
  endMs: number;
  clipId: string | null;
}
```

Add to `src/lib/remix-utils.ts`:
- `buildRemixTimelineSlots(durationMs, cutMarkers)` — creates slots split at cut marker boundaries, with `ceil(durationMs / 1000)` total slots.
- `assignClipToSlot(slots, slotIndex, clipId)` — immutable update.
- `moveTimelineClip(slots, fromIndex, toIndex)` — swap clips between slots.
- `getNearestMarker(markers, timestampMs, thresholdMs)` — for delete-nearest behavior.

### 2.2 Extend `CreateRemixJobInput`

Add `aspectRatio: AspectRatio` and `timelineClipIds: Array<string | null>` fields.

### 2.3 Rework `KanvasRemix.tsx` layout

**Left rail** (~480px):
- B-roll clip gallery with category breadcrumbs, sort dropdown, grid of clip thumbnails (existing, minor restyle).
- Collapsible Controls section: template selector, no-cuts toggle, lyric style preset buttons with live mini-text previews, scale slider, clip ratio, filter, progress bar, shuffle button, export button.

**Right canvas area**:
- Aspect ratio toggle (`16:9` / `9:16`) in top-right corner.
- Remotion `Player` with `ref={playerRef}` — remove native `controls` prop.
- Custom transport bar below the player: replay button, play/pause, timecode (`0:00 / 0:15`), keyboard `Space` to toggle.
- Segmented scrub bar showing template cut markers as red/cyan tick overlays.
- Lag disclaimer banner.

**Bottom timeline strip**:
- Horizontal scrollable row of `requiredSlots` slots.
- Each slot: numbered, shows thumbnail if filled, duration badge, remove button, "Drop video here" placeholder if empty.
- Click a gallery clip to fill the next empty slot.
- Filled slots show clip thumbnail with index number and duration.

### 2.4 Custom PlayerRef transport

Replace `controls` + `clickToPlay` + `loop` with a `PlayerRef`:
```typescript
const playerRef = useRef<PlayerRef>(null);
```
Wire play/pause, seek, current time display, and Space key to the ref. Show a visible play button overlay that disappears during playback.

### 2.5 Style preset buttons

Use the existing `LYRIC_STYLES` array. Each button shows a mini text preview styled with the style's `fill`, `font`, `stroke`, and `background` properties — matching the screenshot's "THE" / "THE QUICK" preview text.

### 2.6 Database migration

Add a migration for `remix_jobs`:
- `aspect_ratio text default '9:16'`
- `timeline_json jsonb default '[]'`

### 2.7 Footage import stub

The Import button creates a local object URL immediately for preview. When Supabase storage is available, it uploads and creates a `footage_assets` row. For this pass, the local-only path is sufficient.

---

## Files Changed

| File | Action |
|---|---|
| `src/components/kanvas-lyrics/types.ts` | Update WizardStep, drop visualize |
| `src/components/kanvas-lyrics/MarkersPanel.tsx` | Major rewrite: preview stage, shortcuts, undo/redo stack, delete key |
| `src/components/kanvas-lyrics/VisualizePanel.tsx` | Delete |
| `src/components/kanvas-lyrics/AudioPanel.tsx` | Restyle to screenshot |
| `src/components/kanvas-lyrics/LyricsPanel.tsx` | Restyle success state |
| `src/components/kanvas-lyrics/KanvasLyricsFooter.tsx` | Update save conditions |
| `src/pages/KanvasLyrics.tsx` | Remove step 4, wire new marker handlers |
| `src/features/remix/types.ts` | Add RemixTimelineSlot, extend CreateRemixJobInput |
| `src/lib/remix-utils.ts` | Add timeline slot builders, getNearestMarker |
| `src/pages/KanvasRemix.tsx` | Major rewrite: custom transport, timeline strip, layout |
| `src/components/remix/LyricRemixComposition.tsx` | No changes needed |
| `supabase/migrations/[timestamp]_remix_timeline.sql` | Add columns |
| `src/features/remix/service.ts` | Pass new fields |

---

## Tests

- Unit tests for `snapMarkerMs`, `normalizeCutMarkers`, `buildRemixTimelineSlots`, `assignClipToSlot`, `moveTimelineClip`, `getNearestMarker`, `quoteRemixCredits`.
- Component test for KanvasLyrics: no VisualizePanel rendered, preview inside MarkersPanel, keyboard shortcuts work, save enables correctly.
- Component test for KanvasRemix: defaults to 9:16, renders correct slot count, style switch updates props.
