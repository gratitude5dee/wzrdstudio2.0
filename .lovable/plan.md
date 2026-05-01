## Create Template flow — extended durations + Visualize step

The Create Template wizard currently has 3 steps (Audio → Lyrics → Markers) and only allows 15/20/25/30s clips. Two upgrades:

1. Extend clip durations to **15s · 30s · 45s · 60s** (replacing 20/25 to match what was requested).
2. Add a **Step 4 "Visualize"** that plays the trimmed clip and renders the lyrics karaoke-style with the user's cut markers triggering CUT/KEEP flashes — so the user previews the template before saving.

Transcription stays on **GMI Cloud `google/gemini-3.1-flash-lite-preview`** — already wired in `kanvas-lyrics-transcribe`. No provider work needed.

---

### 1. Widen allowed clip durations to 15 / 30 / 45 / 60 seconds

**Database migration**
- Drop the `selection_duration_ms BETWEEN 15000 AND 30000` CHECK on `kanvas_lyric_templates`, replace with `selection_duration_ms IN (15000, 30000, 45000, 60000)`.
- `NOTIFY pgrst, 'reload schema';`

**Edge function**
- `supabase/functions/kanvas-lyrics-template/index.ts` — change the validator (`n must be 15000, 20000, 25000, or 30000`) to accept `{15000, 30000, 45000, 60000}`. Existing rows on 20/25 stay valid for read; only new selections are constrained at the API.
- `supabase/functions/kanvas-lyrics-transcribe/index.ts` — no change; it derives the clip window from `selection_duration_ms` directly.

**Frontend**
- `src/components/kanvas-lyrics/constants.ts` → `CLIP_DURATIONS = [15, 30, 45, 60]`.
- `src/components/kanvas-lyrics/types.ts` → `ClipDuration = 15 | 30 | 45 | 60`.
- `src/features/kanvas-lyrics/types.ts` → `ClipDurationMs = 15000 | 30000 | 45000 | 60000`.
- `src/pages/KanvasLyrics.tsx` → local `ClipDurationMs` alias updated.
- The duration pill row (`AudioPanel`) iterates `CLIP_DURATIONS`, so labels update automatically. Pills will read `15s · 30s · 45s · 1m`.

---

### 2. New Step 4 "Visualize" — lyric template preview

**Wizard model**
- `WizardStep = 1 | 2 | 3 | 4`; add `'visualize'` to `AppState`.
- After clicking **Done** on Markers (Step 3), advance to Step 4.
- Footer stepper extends to 4 chips: `Audio · Lyrics · Markers · Preview` (icon: `Eye`).
- `saveEnabled = currentStep === 4` (Save Template moves to step 4; the footer Save remains as the final commit).

**New component: `src/components/kanvas-lyrics/VisualizePanel.tsx`**

Layout — fits the Noir Futurist references the user shared:

```text
┌─ 4  Visualize ───────────────────────────────── ▣ ┐
│  Preview your lyric template                       │
│ ┌────────── 16:9 stage (full width) ──────────┐    │
│ │                                             │    │
│ │              ACTIVE WORD                    │    │  ← yellow caps;
│ │            (CUT flash on markers)           │    │    rose ring + "CUT"
│ │                                             │    │    when within 0.15s
│ │  [▶/⏸]                              0:04/0:30│    │
│ └─────────────────────────────────────────────┘    │
│  Progress bar (orange→amber)                       │
│  Caption ribbon: prev · CURRENT · next             │
│  [↻ Replay]              [✓ Save Template]         │
└────────────────────────────────────────────────────┘
```

Behavior:
- Reuses the parent's `useAudioEngine` (already loops over the trimmed clip).
- Active-word logic already exists in `KanvasLyrics.tsx` (`activeWordId` memo). Pass active/prev/next words down.
- Per cut marker: when `|playheadTime − marker.timestamp| ≤ 0.15s` AND `isPlaying`, flash the stage red and render **CUT** for ~150ms (port `isCutMoment` logic from `MarkersPanel`).
- Auto-play once on entering Step 4; `Replay` seeks to 0 and restarts.
- "Save Template" button calls existing `handleSave`.

**Layout in `src/pages/KanvasLyrics.tsx`**
- Keep `lg:grid-cols-3` for Audio/Lyrics/Markers (so the user can scrub back to any step).
- When `currentStep === 4`, render `<VisualizePanel/>` **full-width below the grid** (`mt-6`) so the karaoke stage gets the full canvas.
- Add `handleMarkersDone` (advance to step 4, seek engine to 0, autoplay).
- In `MarkersPanel`, swap "Add Cut" footer to also show a primary **"Preview Template →"** button when at least 1 marker placed (or simply "Preview Template" if 0 markers, since markers are optional).
- During Step 4, mark Markers panel buttons as visually-locked (no input changes), keeping it as a read-only context card.

**Footer updates**
- `KanvasLyricsFooter` STEPS array gains `{ id: 4, label: 'Preview', icon: Eye }`.
- Center stats on Step 4 also surface `markerCount`.
- Save Template button becomes active only on Step 4.

---

### 3. Visual polish (small)

- Header subtitle updates: `Audio · Lyrics · Markers · Preview`.
- Save button keeps the cyan→emerald gradient in code (already aligned with the screenshots).
- All other Noir Futurist tokens (orange `#f97316`, black `#050506`) unchanged per project memory.

---

### 4. Files touched

Created
- `supabase/migrations/<timestamp>_widen_lyric_clip_durations.sql`
- `src/components/kanvas-lyrics/VisualizePanel.tsx`

Edited
- `supabase/functions/kanvas-lyrics-template/index.ts`
- `src/components/kanvas-lyrics/constants.ts`
- `src/components/kanvas-lyrics/types.ts`
- `src/features/kanvas-lyrics/types.ts`
- `src/components/kanvas-lyrics/KanvasLyricsFooter.tsx`
- `src/components/kanvas-lyrics/MarkersPanel.tsx` (CTA → "Preview Template")
- `src/pages/KanvasLyrics.tsx` (Step 4 state, layout, handlers, hydration mapping for `'saved'` status → step 4)

---

### 5. QA checklist after build

- Upload audio → all four pills (15s, 30s, 45s, 1m) selectable; longer clips are not clipped server-side.
- Step 1 → 2 → 3 → 4 stepper advances correctly; previous panels stay visible/inspectable.
- Step 2 transcription succeeds via GMI Cloud (Gemini 3.1 Flash Lite Preview) — unchanged.
- Step 4: clip auto-plays, words highlight in sync, CUT flashes at each marker, KEEP shown otherwise, Replay restarts, Save persists template and returns to landing.
- Templates loaded via `?templateId=` with `status === 'saved'` route to landing (already complete) instead of resuming Step 4.

Approve to implement.