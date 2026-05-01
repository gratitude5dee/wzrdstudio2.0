
## Goal

Replace the simplified black "CUT/KEEP" preview box inside the MarkersPanel (step 3) with the full-featured visualizer stage that was previously in the deleted VisualizePanel. This gives users a rich lyric playback preview directly in the Cut Markers card on the right, without needing a separate step or panel at the bottom.

## Changes

### 1. Upgrade the preview stage in `MarkersPanel.tsx`

Replace the current black box (lines ~97-133) with the rich visualizer from the old VisualizePanel:

- **16:9 aspect ratio stage** with gradient backdrop (orange-to-black normally, rose when CUT flashes)
- **Animated active word** display with yellow glow, `fade-in zoom-in` animation, keyed by word ID
- **CUT flash** with rose glow and shadow when playhead is near a marker
- **"Press play"** placeholder text when idle
- **Play/Pause button** (bottom-left of stage, orange-accented)
- **Timecode display** (bottom-right, `m:ss / m:ss` format)
- **Marker ticks** along the bottom edge of the stage (rose-colored, positioned proportionally)
- **Progress bar** below the stage (orange gradient)
- **Caption ribbon** showing prev/active/next words in a horizontal strip

### 2. Add surrounding-word logic

The current MarkersPanel only tracks `activeWord` (a string). Upgrade to compute `activeWord`, `prevWord`, and `nextWord` objects (with `id`, `text`, `startTime`, `endTime`) from the blocks array, matching the old VisualizePanel logic. This powers the caption ribbon and keyed animations.

### 3. Keep all existing marker controls

The waveform, zoom slider, shortcut chips, undo/redo, and marker count controls remain exactly as they are below the new visualizer stage.

### Files to edit

- `src/components/kanvas-lyrics/MarkersPanel.tsx` -- replace the black preview box with the full visualizer stage, add word-context logic, add progress bar and caption ribbon
