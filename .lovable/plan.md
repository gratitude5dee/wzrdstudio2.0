
## Fix page cutoff — make scrollable and tighten layout

### Problem
The `h-screen` + `overflow-hidden` on the root container cuts off the bottom (shuffle/export buttons hidden) and right side (player not rendering). Content needs to be scrollable while staying tight.

### Changes (`src/pages/KanvasRemix.tsx`)

**Root layout**: Change from `h-screen overflow-hidden` to `min-h-screen` so the page can scroll naturally.

**Left rail**: Make it sticky with `lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)]` (56px = header height) so it stays in view while the right side scrolls. Narrow from 400px to 380px. The left rail already has `overflow-y-auto` on its inner section, so it scrolls independently.

**Right canvas**: Remove `min-h-0` constraint. Give the player area a sensible min-height (`min-h-[360px]`) instead of flex-1 with min-h-0 which collapses it. Use `max-h-[calc(100vh-220px)]` on the player wrapper so it fills available space but leaves room for transport + timeline without cutting off.

**Timeline strip**: Ensure it's always visible at the bottom — no overflow clipping from the parent.

These changes let the page scroll if content overflows while keeping the layout tight and the left rail pinned.
