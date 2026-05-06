
# WZRD Studio Landing + Studio Performance Plan

## 1. Route Shell Split

**Current**: `App.tsx` wraps every route (including `/`) in `AuthProvider`, `ThirdwebProvider`, `VoiceAgentProvider`, `SidebarProvider`, `CursorLoadingProvider`, `InsufficientCreditsDialog`, and a 2-second `LoadingScreen`.

**Change**: Restructure into three route shells:

- **Public shell** (`/`, `*`): Only `QueryClientProvider`, `ThemeProvider`, `BrowserRouter`, `TooltipProvider`, `Suspense`. No auth, no wallet, no voice, no sidebar, no cursor, no credit dialogs.
- **Login shell** (`/login`): Adds `AuthProvider` only.
- **Authenticated shell** (all other routes): Adds `AuthProvider`, `ThirdwebProvider`, `VoiceAgentProvider`, `SidebarProvider`, `CursorLoadingProvider`, `InsufficientCreditsDialog`, `CursorWrapper`.

Files:
- `src/App.tsx` -- slim router with lazy `LoginRoute` and `AuthenticatedRoutes`
- `src/app/LoginRoute.tsx` -- new, wraps Login in AuthProvider
- `src/app/AuthenticatedRoutes.tsx` -- new, all protected routes with full provider stack

Remove the 2-second `LoadingScreen` timer entirely. Protected routes use existing `PerfShell` skeleton during auth resolution.

The `lovable-tagger` Vite plugin and its `componentTagger()` call remain untouched -- they are dev-only and unrelated.

## 2. Landing Page Optimization

- **`src/pages/Landing.tsx`**: Remove `useAuth()` import and `wzrdLogo` raw PNG import. Wrap below-fold sections (`FeatureGrid`, `UseCasesSection`, `TestimonialsSection`, `FAQAccordion`, `PricingSectionRedesigned`, `ModelEcosystemGrid`, `GovernanceSection`, `UseCasesShowcase`, `MassiveFooter`, `ThreeStepSection`, `IPhoneMockup`) in a `LazySection` intersection-observer gate so they only render when near the viewport.
- **`src/components/landing/LazySection.tsx`**: New shared component using `IntersectionObserver` with `rootMargin: '200px'` to defer rendering.
- Gate `CinematicIntro` behind `requestIdleCallback` + `prefers-reduced-motion` check so it does not block first paint.
- Convert scroll handler to passive listener with `requestAnimationFrame` throttle.

## 3. Media Pipeline + Optimized Derivatives

- **`scripts/generate-optimized-media.mjs`**: New build-prep script using `sharp` (devDependency) to generate AVIF/WebP/JPEG derivatives from source PNGs, and `ffmpeg` (already in PATH) to convert `wzrd-intro.gif` to MP4/WebM loops + WebP posters. Outputs to `public/generated-media/`.
- **`src/lib/optimizedMedia.ts`**: Type definitions for the optimized media contract (`id`, `kind`, `alt`, `width`, `height`, `placeholder`, `sources`, `srcSet`, `sizes`, `poster`, `previewLoop`).
- **`src/lib/generated/optimizedMusicPolishManifest.ts`**: Generated manifest mapping each music-polish asset to its optimized derivatives with dimensions, placeholders, and role metadata.
- **`src/lib/brandMedia.ts`**: Exports hero video poster/loop and logo derivative entries.
- **`src/lib/musicPolishAssets.ts`**: Refactor from 26 raw PNG imports to exporting optimized metadata from the manifest. No raw imports remain.
- **`src/components/media/ResponsiveImage.tsx`**: New `<picture>` component with AVIF/WebP/JPEG sources and blur placeholder.
- **`src/components/media/SmartVideo.tsx`**: New `<video>` component with MP4/WebM sources and poster, autoplay/muted/loop for hero use.
- **`src/components/landing/HeroSection.tsx`**: Replace raw `wzrd-intro.gif` import with `SmartVideo` using generated poster + loop.
- Add `sharp` as a devDependency. Add `"media:optimize"` script to `package.json`.

## 4. index.html Cleanup

- Remove the GPT Engineer `<script src="https://cdn.gpteng.co/gptengineer.js">` tag.
- Remove `preconnect`/`dns-prefetch` hints for `api.supabase.co`, `fal.media`, `v3.fal.media`, `api.gmicloud.ai` (not needed on public landing; authenticated code can add them dynamically or they connect on first use).
- Keep font preconnects (fonts.googleapis.com, fonts.gstatic.com).

## 5. Package Manager Canonicalization

- Remove `package-lock.json`.
- `bun.lock` remains as the canonical lock file.

## 6. Vite Chunk Config

- Remove the `manualChunks` function from `vite.config.ts` that created named chunks (`editor-editframe`, `visual-3d`, `kanvas-worldview`, `kanvas-character`, `kanvas-edit`). These caused feature chunks to appear as entry dependencies. Lazy route boundaries handle code-splitting naturally.

## 7. Static Guardrails (Tests)

- **`src/lib/__tests__/performance-guardrails.test.ts`**: New Vitest test verifying:
  - `App.tsx` does not import `AuthProvider`, `ThirdwebProvider`, `VoiceAgentProvider` at module scope
  - No UI file imports raw music-polish PNGs, raw intro GIF, or raw logo PNG
- **`src/lib/__tests__/optimized-media.test.ts`**: New Vitest test verifying manifest entries have required fields (dimensions, placeholders, sources).

## Implementation Order

1. Route shell split (App.tsx + 2 new files)
2. Landing page optimization (Landing.tsx + LazySection component)
3. Media pipeline + derivatives (script, types, manifest, components)
4. Hero/landing media swap (HeroSection, musicPolishAssets)
5. index.html cleanup
6. Remove package-lock.json, remove manualChunks
7. Add guardrail tests

Estimated: ~15 files modified/created, ~1 file deleted (package-lock.json).
