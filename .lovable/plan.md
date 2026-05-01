
## What we're building

Three improvements to the Remix editor page (`/kanvas/remix/:templateId`):

1. **More clip library assets** -- Expand the fallback footage library from 6 to ~12 clips with varied durations, covering the existing categories (Bay Area 8mm, Modern, Aerial, Abstract, Nature).

2. **Kanvas header + back navigation** -- Add the shared `KanvasLyricsHeader` at the top of the remix page and a left chevron button next to the "Remix" title that navigates back to the templates landing (`/kanvas/lyrics`).

3. **Drag-and-drop clips into timeline slots** -- Make clip library thumbnails draggable and timeline slots droppable using native HTML5 drag/drop (no new deps). Users can drag a clip from the library grid and drop it onto a specific timeline slot.

4. **Style unification** -- Replace cyan/teal accents with the Kanvas orange (`#f97316`) design system. Update borders, glows, active states, buttons, and gradients to match the Noir Futurist theme used across the rest of Kanvas.

---

## Technical details

### 1. Expand fallback footage (`src/features/remix/service.ts`)

Add ~6 more entries to `fallbackAssets[]` using the existing `/bgvid.mp4` and `/wzrdstudiointro1.mp4` files with varied durations and categories (nature-coast, nature-forest, abstract-glitch). This ensures the clip library grid shows enough content for a full 15-slot timeline.

### 2. Header + back button (`src/pages/KanvasRemix.tsx`)

- Import and render `KanvasLyricsHeader` at the top of the page (above the grid layout).
- Add a `ChevronLeft` icon button to the left of the "Remix" title that calls `navigate(appRoutes.kanvasLyrics)`.
- Adjust the grid layout to account for the header height (add `pt-[68px]` or similar offset matching the Kanvas layout shell pattern).

### 3. Drag-and-drop (`src/pages/KanvasRemix.tsx`)

- On clip library thumbnails: add `draggable`, `onDragStart` setting `dataTransfer` with the clip ID.
- On timeline slot containers: add `onDragOver` (prevent default) and `onDrop` that reads the clip ID and calls `assignClipToSlot`.
- Visual feedback: highlight the drop target slot with an orange border on `onDragEnter`/`onDragLeave`.

### 4. Style pass (`src/pages/KanvasRemix.tsx`)

Replace all `cyan-300`, `cyan-400`, `cyan-200` references with orange equivalents (`orange-400`, `orange-500`, `[#f97316]`). Update gradient stops, border colors, shadow colors, and active states to match the Noir Futurist system (orange accent, absolute black backgrounds, white/zinc text).
