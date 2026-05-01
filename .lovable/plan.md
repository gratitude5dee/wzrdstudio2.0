
## Fix remix page layout and clip thumbnails

### Problem
1. Video preview area has excessive empty space — player floats in a huge void
2. Clip library thumbnails show blank/broken frames because `<video>` elements lack `preload` and time seek
3. Timeline slots have the same issue with video thumbnails
4. Left rail is too wide (480px), wasting space

### Changes (all in `src/pages/KanvasRemix.tsx`)

**1. Layout tightening**
- Change root container from `min-h-screen` to `h-screen` so the entire page fits the viewport without scrolling
- Narrow the left rail from `480px` to `400px`
- Replace the player's `flex-1 items-center justify-center` wrapper with a constrained container that uses `max-h-[calc(100%-160px)]` so the player fills available space minus transport/timeline, eliminating the void
- Reduce padding (pt-6 to pt-4, px-8 to px-6) throughout the left rail for density

**2. Video thumbnail previews**
- For all `<video>` elements in the clip library grid: add `preload="metadata"` and append `#t=0.5` to the `src` URL so browsers render an actual frame from the video
- Same fix for timeline slot video thumbnails
- This replaces the current blank black rectangles with real video frame previews

**3. Player area optimization**
- Remove fixed `h-[560px]`/`h-[400px]` from the player container
- Instead use responsive sizing: `max-h-full w-auto aspect-[9/16]` (or `aspect-video` for 16:9) so the player scales to fill the available vertical space without overflow
- Transport controls, disclaimer, progress bar, and timeline strip are pinned at the bottom with no flex-grow

### Files changed
- `src/pages/KanvasRemix.tsx` — layout, thumbnail, and sizing updates
