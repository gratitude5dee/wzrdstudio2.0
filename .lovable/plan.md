
# Brand-Native Card Imagery Replacement Plan

## Goal
Eliminate every Unsplash / `placehold.co` / generic placeholder URL in card components and replace them with on-brand "Noir Futurist" stills generated via Lovable AI (`google/gemini-3.1-flash-image-preview`). Result: faster loads (locally-bundled, no external CDN handshake), full visual cohesion with the orange-on-black brand, and zero third-party image dependency.

## Components in Scope (audit results)

| File | Cards | Current source |
|---|---|---|
| `src/components/landing/UseCasesShowcase.tsx` | 3 | unsplash |
| `src/components/landing/CinematicHeroAnimatix.tsx` | 3 | unsplash |
| `src/components/landing/SoulCinemaGallery.tsx` | 8 | unsplash |
| `src/components/landing/CreateTodaySection.tsx` | 5 | unsplash |
| `src/components/landing/TopChoiceGrid.tsx` | 8 | unsplash |
| `src/components/landing/ArenaZeroHero.tsx` | 1 (hero) | unsplash |
| `src/components/landing/PhotodumpBanner.tsx` | 1 (hero) | unsplash |
| `src/components/kanvas/EditStudioSection.tsx` | 8 (mode cards) | unsplash |
| `src/components/kanvas/CinemaStudioSection.tsx` | 8 genres + 4 avatars | unsplash |
| `src/components/home/JudgePanel.tsx` | 8 | placehold.co |
| `src/services/mockAssetApi.ts` | mock fallback | `/placeholder.svg` |

**Total: ~57 unique images to generate.**

## Approach

### Phase 1 — Generate brand assets via Lovable AI script
Use the bundled `lovable_ai.py` skill (`google/gemini-3.1-flash-image-preview` for speed + quality). Each image generated to `src/assets/generated/<category>/<slug>.jpg` (16:9 for cards, 1:1 for avatars, 21:9 for heroes). A single Python script iterates the manifest below and writes files in parallel batches of 4 to stay under rate limits.

### Phase 2 — Wire components
Convert each component's hard-coded URL array to local `import` statements (Vite hashes + tree-shakes). Add `loading="lazy"`, `decoding="async"` on every `<img>` (some already done in earlier polish pass — verify and extend).

### Phase 3 — QA
After generation, render thumbnails of the 57 images side-by-side as a contact sheet PNG to `/mnt/documents/brand_card_qa.png` and visually inspect for: brand cohesion (black bg, orange accents acceptable, no stock-photo "people in office" vibe), aspect-ratio correctness, and absence of broken/blank outputs. Regenerate any failures.

## Visual Direction (applied to every prompt)

Global suffix appended to each prompt:
> "Cinematic still, ultra-low-key lighting on absolute black #050505 background, single warm-orange #f97316 rim light or accent, anamorphic 35mm grain, shallow depth of field, no text, no logos, no people facing camera unless specified, editorial fashion-magazine composition, Noir Futurist aesthetic."

## Prompt Manifest (excerpt — full list inlined in script)

### Landing — UseCasesShowcase (3 × 16:9)
1. **Commercials** — "Sleek matte-black luxury perfume bottle floating in void, single orange volumetric light beam slicing across product, glossy reflection on obsidian floor."
2. **Animations** — "Abstract orange line-art character mid-leap, dissolving into geometric particles against pitch-black backdrop, motion-blur trails."
3. **Films** — "70mm widescreen frame of a lone silhouette in a long obsidian corridor, single orange door at the vanishing point, theatrical god-rays."

### Landing — CinematicHeroAnimatix (3 × 16:9)
4. **Storyboard panel** — "Rough charcoal storyboard frame on black paper, orange grease-pencil annotations and arrows, scene of a car chase."
5. **Animatic frame** — "2D animation keyframe, orange-on-black character pose sheet with rotation gridlines."
6. **Final shot** — "Photoreal cinema frame: rain on neon-lit asphalt, single orange traffic signal glow, anamorphic flares."

### Landing — SoulCinemaGallery (8 × 1:1)
7–14. Eight portraits/scenes: "noir close-up of an android face half-lit in orange," "neon-rainy Tokyo alley reflection," "vintage film projector beaming orange light into smoke," "robot ballerina in spotlight," "obsidian sculpture with molten orange interior," "abandoned theater seats lit by single orange spot," "minimalist studio with hanging orange neon ring," "cinematographer's hands holding 35mm film up to orange light."

### Landing — CreateTodaySection (5 × 4:5)
15. **CREATE IMAGE** — "Floating polaroid prints in mid-air, each glowing with orange interior light, against deep black."
16. **CREATE VIDEO** — "Strip of 35mm film unfurling in zero-gravity, frames lit individually by warm orange."
17. **MOTION CONTROL** — "Robotic camera arm in profile, end-effector glowing orange, set against matte black studio cyc."
18. **SOUL 2.0** — "Holographic orange wireframe of a human bust rotating in dark void, particle dissolution at edges."
19. **SOUL ID** — "Macro of an iris, amber-orange flecks against deep black sclera, fashion-editorial sharpness."

### Landing — TopChoiceGrid (8 × 1:1)
20–27. Square micro-icons for: Nano Banana Pro (glowing orange banana sculpture), Motion Control (camera dolly silhouette), Skin Enhancer (porcelain mask in spot), Shots (clapperboard close-up), Angles 2.0 (multi-mirror reflection), Kling 3.0 (warped time-loop spiral), Seedream (dream-like ink swirl), Soul Cast (silhouette twinning).

### Landing — Hero banners (2 × 21:9)
28. **ArenaZeroHero** — "Vast black coliseum at night, single orange spotlight on empty center stage, smoke drift, wide cinematic letterbox."
29. **PhotodumpBanner** — "Wall of overlapping black-and-orange polaroids, photo-dump collage, one image glowing brighter than the rest."

### Kanvas — EditStudioSection (8 × 4:3)
30. **Inpaint** — "Portrait with one cheek replaced by digital orange grid mesh, restoration in progress."
31. **Remove BG** — "Black silhouette of model with checkered transparency edge glow in orange."
32. **Upscale** — "Pixelated face on left half, hyper-sharp on right half, orange divider line."
33. **Relight** — "Same statue rendered three times under different orange light angles, comparison strip."
34. **Stylize** — "Photo of a chair morphing into oil painting, orange brushstrokes."
35. **Skin Enhance** — "Macro skin texture with orange healing wand cursor."
36. **Angles** — "Subject orbited by orange virtual camera rig, ring of viewpoints."
37. **Product Placement** — "Floating sneaker in matte-black product cube, single orange under-glow."

### Kanvas — CinemaStudioSection (8 genres × 16:9 + 4 avatars × 1:1)
38–45. Genre tiles each evoke: Action (sparks + silhouette), Adventure (mountain peak + orange sunrise), Comedy (theatrical mask half-orange), Drama (single spotlit chair on stage), Thriller (shadowed hand on door), Horror (black corridor with orange flicker), Detective (rain-streaked window + orange neon), Romance (two silhouettes + warm bokeh).
46–49. Four director-avatar squares: stylized portraits, 3/4 profile, monochrome with orange rim light, distinct gender/ethnicity coverage.

### Home — JudgePanel (8 × 1:1)
50–57. Eight "judge" avatars: AI-generated stylized portraits, clearly synthetic (subtle CG sheen), monochrome with orange highlights, varied silhouettes/styles to read as distinct personas. No real-person likeness.

## Technical Steps

```text
1. Copy script: knowledge://skill/ai-gateway/scripts/lovable_ai.py -> /tmp/
2. Write /tmp/generate_brand_cards.py — manifest of 57 entries (slug, prompt, aspect)
   - Iterates, calls lovable_ai.generate_image() w/ model gemini-3.1-flash-image-preview
   - Writes to src/assets/generated/{landing|kanvas|home}/{slug}.jpg
   - Concurrency: asyncio.Semaphore(4) to respect rate limits
3. Build contact sheet via Pillow -> /mnt/documents/brand_card_qa.png; inspect.
4. Refactor each component:
   - Replace inline URL with `import imgX from '@/assets/generated/.../x.jpg'`
   - Add loading="lazy" decoding="async" width/height attrs
5. Update mockAssetApi.ts MOCK_THUMBNAIL/MOCK_PREVIEW to use a generated noir placeholder.
6. Delete now-unused public/placeholder.svg references (keep file for safety).
```

## Files to Edit
- `src/components/landing/{UseCasesShowcase,CinematicHeroAnimatix,SoulCinemaGallery,CreateTodaySection,TopChoiceGrid,ArenaZeroHero,PhotodumpBanner}.tsx`
- `src/components/kanvas/{EditStudioSection,CinemaStudioSection}.tsx`
- `src/components/home/JudgePanel.tsx`
- `src/services/mockAssetApi.ts`
- New: `src/assets/generated/**/*.jpg` (~57 files, JPEG quality 85, target ≤120KB each)

## Acceptance Criteria
- Zero `unsplash.com` / `placehold.co` / `via.placeholder` references in `src/` (verified by `rg`).
- Every card renders a brand-cohesive image with no layout shift (width/height set).
- All `<img>` use `loading="lazy"` + `decoding="async"`.
- Contact-sheet QA shows no blank/broken/off-brand frames; regenerations completed where needed.
- Bundle size delta documented; expected gain in first-paint due to no external image hosts.

## Out of Scope
- Provider logo cards in `src/assets/cards/provider-*.jpg` (legitimate brand logos — kept).
- Worldview Gaussian splat thumbnails (generated dynamically per project).
- Generated-result thumbnails for user jobs (those are runtime user content).
