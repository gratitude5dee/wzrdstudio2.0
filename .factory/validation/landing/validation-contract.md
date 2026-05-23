# Validation Contract: Landing Page & Intro Polish (Milestone 1)

---

## CINEMATIC INTRO

### VAL-LAND-001: WebGL Three.js Logo Reveal Replaces LobsterIntro
The cinematic intro on first visit MUST render a WebGL Three.js–based logo reveal using `wzrdtechlogo.png` instead of the previous LobsterIntro (lobster silhouette + thermal text + ember particles). The old `LobsterIntro.tsx` component and its sub-components (`CausticOverlay`, `LobsterSilhouette`, `EmberParticles`, `ThermalText`) MUST NOT be rendered.
**Pass:** WebGL canvas element is present in the intro overlay; `wzrdtechlogo.png` is visible as the central reveal asset; no lobster silhouette, caustic overlay, or thermal text animations appear.
**Fail:** LobsterIntro sub-components still render, or intro uses non-WebGL (CSS/Framer-only) animations, or `wzrdtechlogo.png` is absent.
Evidence: DOM inspection for `<canvas>` element within intro overlay; screenshot at each intro phase; absence of LobsterIntro import in Landing.tsx.

### VAL-LAND-002: Intro Plays Automatically on First Visit
When a user navigates to the landing page for the first time in a session (no `mog-intro-seen` in sessionStorage), the cinematic intro MUST play automatically without requiring user interaction.
**Pass:** Intro overlay appears at z-index ≥ 99999, covering the full viewport, and animation sequence begins within 500ms of page load.
**Fail:** Intro does not appear, or requires a click/tap to start, or is partially obscured.
Evidence: sessionStorage check confirms `mog-intro-seen` is NOT set; intro overlay is visible immediately on page load.

### VAL-LAND-003: Intro Skip on Click/Tap
The user MUST be able to skip the intro at any phase by clicking or tapping anywhere on the intro overlay. Upon skip, the intro MUST dismiss immediately (within 600ms transition) and the landing page content MUST be fully visible.
**Pass:** Click/tap during any phase (early, mid, late) triggers `onComplete`, sets `mog-intro-seen` in sessionStorage, and the intro fades out cleanly.
**Fail:** Click does not dismiss intro, or landing page content is not revealed after skip, or sessionStorage flag is not set.
Evidence: Manual click test at each intro phase; sessionStorage value check after skip; no UI remnants from intro remain.

### VAL-LAND-004: Intro Skip via Keyboard (Escape Key)
The user SHOULD be able to skip the intro by pressing the Escape key, providing an accessible alternative to click/tap.
**Pass:** Pressing Escape during the intro triggers the same skip behavior as click.
**Fail:** Escape key has no effect on the intro.
Evidence: Keyboard event test during intro playback.

### VAL-LAND-005: Intro Does Not Replay Within Same Session
After the intro completes (either by finishing naturally or being skipped), navigating away from the landing page and returning MUST NOT replay the intro within the same browser session.
**Pass:** `sessionStorage.getItem('mog-intro-seen')` returns `'true'` after intro completes; subsequent visits to `/` within the same session skip the intro entirely.
**Fail:** Intro replays on return navigation within the same session.
Evidence: Navigate to `/` → intro plays → navigate to `/home` → navigate back to `/` → no intro.

### VAL-LAND-006: Intro Animation Completes Gracefully
If the user does NOT skip, the intro animation MUST complete its full sequence and automatically dismiss, revealing the landing page. The total duration SHOULD be approximately 5 seconds (±1s).
**Pass:** Animation proceeds through all phases and auto-dismisses; landing page content is fully interactive after completion.
**Fail:** Intro hangs, loops indefinitely, or leaves residual overlay elements.
Evidence: Timed recording of intro from start to auto-dismiss; no orphaned DOM nodes from the intro after completion.

### VAL-LAND-007: Intro Performance — No Dropped Frames
The WebGL intro MUST maintain ≥ 30fps on mid-range hardware (e.g., M1 MacBook Air, iPhone 12). No visible jank, stuttering, or layout shifts during the intro sequence.
**Pass:** Chrome DevTools Performance panel shows no frames exceeding 33ms during intro; no layout shift entries.
**Fail:** Visible stuttering; frames exceed 33ms consistently; Cumulative Layout Shift > 0.
Evidence: Performance trace of intro sequence; FPS counter screenshot.

### VAL-LAND-008: Intro WebGL Fallback
If the user's browser does not support WebGL (or WebGL context creation fails), the intro MUST either (a) gracefully fall back to a CSS/Framer-based animation using `wzrdtechlogo.png`, or (b) skip directly to the landing page without error.
**Pass:** Disabling WebGL in browser flags results in fallback behavior (no blank screen, no console errors, no crash).
**Fail:** White/black screen, JavaScript error, or app crash when WebGL is unavailable.
Evidence: Test with WebGL disabled via Chrome flags; console log inspection.

---

## LOADING SCREEN

### VAL-LAND-010: Loading Screen Uses wzrdtechlogo.png
The app-wide loading screen (`LoadingScreen.tsx`) MUST display `wzrdtechlogo.png` as the central visual element with a cinematic entry animation (scale + blur + brightness keyframes).
**Pass:** Loading screen shows `wzrdtechlogo.png` (or `/lovable-uploads/wzrdtechlogo.png`) centered on screen with animated entry.
**Fail:** Logo is missing, uses a different image, or appears without animation (static pop-in).
Evidence: Screenshot of loading screen mid-animation; DOM inspection for `<img>` src attribute.

### VAL-LAND-011: Loading Screen Orange/Amber Color Scheme
The loading screen MUST use orange/amber as its accent color throughout — including the radial glow, pulsing aura, concentric rings, particle field, rotating energy ring, lens flare, and bottom progress bar. No green or emerald accents.
**Pass:** All animated elements use orange (`#f97316`), amber (`#f59e0b`), or the `hsl(14, 100%, 64%)` coral family. Progress bar gradient is orange→amber.
**Fail:** Any green/emerald tinted element in the loading screen.
Evidence: Computed style inspection of all animated elements; screenshot comparison.

### VAL-LAND-012: Loading Screen Animated Progress Bar
The bottom progress bar MUST animate from 0% to 100% width over approximately 2 seconds, using an orange→amber gradient, providing visual feedback of loading progress.
**Pass:** Progress bar visually grows from left to right; uses `linear-gradient(90deg, #f97316, #f59e0b)`.
**Fail:** Progress bar is static, missing, or uses wrong colors.
Evidence: Screenshot at 0%, 50%, and 100% progress; style inspection.

### VAL-LAND-013: Loading Screen Exit Animation
When loading completes, the loading screen MUST exit with a smooth opacity fade-out (duration ~600ms) with a slight scale-up (1.02), not an abrupt disappear.
**Pass:** Loading screen fades out smoothly; no flash or pop when transitioning to content.
**Fail:** Abrupt removal, flicker, or content visible before fade completes.
Evidence: Screen recording of loading-to-content transition.

### VAL-LAND-014: Loading Screen Responsive Layout
The loading screen MUST be centered and visually appropriate on all viewport sizes (mobile 320px, tablet 768px, desktop 1440px, ultrawide 2560px). The logo MUST not overflow or be clipped on small screens.
**Pass:** Logo and all effects are centered; no horizontal scroll; logo scales appropriately.
**Fail:** Logo overflows viewport, is off-center, or effects are clipped on mobile.
Evidence: Screenshots at 320px, 768px, 1440px viewport widths.

---

## LANDING PAGE REDESIGN

### VAL-LAND-020: Fullscreen Background Video (bgvid.mp4)
The landing page MUST display `bgvid.mp4` as a fullscreen background video behind the hero section. The video MUST autoplay, loop, be muted, and use `playsInline` for mobile compatibility.
**Pass:** `<video>` element is present with `src="/bgvid.mp4"`, `autoPlay`, `loop`, `muted`, and `playsInline` attributes; video fills the viewport behind hero content.
**Fail:** Video is missing, does not autoplay, is not fullscreen, or plays with sound.
Evidence: DOM inspection of video element and its attributes; visual confirmation of fullscreen coverage.

### VAL-LAND-021: Video Background — Text Legibility
All text overlaying the background video MUST be legible. There MUST be sufficient contrast between text and the video background, achieved through overlay gradients, backdrop blur, or text shadows.
**Pass:** WCAG AA contrast ratio (≥ 4.5:1 for body text, ≥ 3:1 for large text) is met for all hero text against the video background at any frame.
**Fail:** Text is unreadable at any point during video loop; insufficient contrast.
Evidence: Lighthouse accessibility audit; manual contrast check with browser DevTools color picker against darkest and lightest video frames.

### VAL-LAND-022: Video Background — Mobile Autoplay
On iOS Safari and Android Chrome, the background video MUST autoplay without user interaction. This requires `muted`, `playsInline`, and `autoPlay` attributes.
**Pass:** Video autoplays on iOS Safari 15+ and Android Chrome; no play button overlay appears.
**Fail:** Video does not autoplay on mobile; shows poster frame or play button instead.
Evidence: Mobile device/emulator testing on iOS Safari and Android Chrome.

### VAL-LAND-023: Video Background — Fallback for Slow Connections
If `bgvid.mp4` fails to load or takes >3 seconds to buffer, the landing page MUST display a visually appropriate fallback (e.g., dark gradient background, static frame, or the existing `MotionBackground` component) so the page is never blank.
**Pass:** On simulated slow 3G, the page displays a styled background while video loads; no white/empty space.
**Fail:** Page shows blank/white area where video should be; no fallback.
Evidence: Network throttling to Slow 3G in DevTools; screenshot before video loads.

### VAL-LAND-024: Video Background — Performance Impact
The background video MUST NOT cause the landing page to drop below 30fps on mid-range devices. Video decode should not block the main thread.
**Pass:** Performance trace shows no long tasks (>50ms) attributable to video decode; scrolling remains smooth.
**Fail:** Janky scrolling; main thread blocked by video decode.
Evidence: Chrome Performance panel trace during scroll on landing page.

### VAL-LAND-025: Cardboard.dev-Inspired Aesthetic
The landing page redesign MUST adopt a cardboard.dev-inspired aesthetic: clean, minimal, dark-themed with subtle texture, card-based layout sections, refined typography with generous whitespace, and muted accent colors (orange/amber as primary accent).
**Pass:** Visual review confirms card-based section layout, generous whitespace, dark theme consistency, subtle background textures or noise overlays, and orange/amber accent usage.
**Fail:** Landing page retains the previous generic SaaS look without card-based layout; cluttered sections; inconsistent spacing.
Evidence: Side-by-side comparison with cardboard.dev reference; design review screenshots of each section.

### VAL-LAND-026: Landing Page — Sticky Header Behavior
The landing page header MUST remain sticky at the top with `backdrop-blur` and transparency, transitioning to a more compact form on scroll (max-width reduces from 6xl to 4xl). Header MUST be present on both desktop and mobile.
**Pass:** Header stays visible on scroll; becomes compact after 50px scroll; blur backdrop is visible; both desktop and mobile headers render correctly.
**Fail:** Header scrolls away; no visual transition on scroll; mobile header missing.
Evidence: Scroll test screenshots at 0px and 100px scroll positions.

### VAL-LAND-027: Landing Page — Mobile Navigation Menu
On mobile viewports (<768px), a hamburger menu MUST be present that toggles a full-screen overlay navigation with links to Features, Pricing, Testimonials, FAQ, and auth actions (Login/Sign Up or Dashboard/Logout based on auth state).
**Pass:** Hamburger icon visible on mobile; tap opens overlay with all nav links; tap again or tap outside closes overlay; auth state is reflected correctly.
**Fail:** Hamburger missing; overlay doesn't open; links are missing; auth state is wrong.
Evidence: Mobile viewport test; screenshot of open/closed states.

### VAL-LAND-028: Landing Page — Section Anchors and Smooth Scroll
Clicking nav links (Features, Pricing, Testimonials, FAQ) MUST smooth-scroll to the corresponding section with a header offset of 120px to prevent content from being hidden behind the sticky header.
**Pass:** Each nav link scrolls to the correct section; content is not obscured by header after scroll completes.
**Fail:** Links don't scroll; wrong section targeted; content hidden behind header.
Evidence: Click each nav link; verify scroll position and content visibility.

### VAL-LAND-029: Landing Page — Dark Mode Enforcement
The landing page MUST enforce dark mode by adding the `dark` class to `document.documentElement` and removing `light` and `system` classes on mount.
**Pass:** `<html>` element has class `dark`; no `light` or `system` class present while on landing page.
**Fail:** Landing page renders in light mode or system mode.
Evidence: DOM inspection of `<html>` classList.

### VAL-LAND-030: Landing Page — All Sections Render
The landing page MUST render all sections in order: MogPromoSection, HeroSection, Trust Indicators, FeatureGrid, UseCasesSection, TestimonialsSection, NewReleasePromo, PricingSectionRedesigned, FAQAccordion, StickyFooter.
**Pass:** All sections are present in the DOM and visible when scrolling; no missing sections; no rendering errors.
**Fail:** Any section fails to render; console errors during section rendering.
Evidence: Full-page scroll recording; section-by-section DOM check.

### VAL-LAND-031: Landing Page — CTA Buttons Route Correctly
All Call-to-Action buttons MUST route to correct destinations:
- "Start Creating Free" → `/login?mode=signup`
- "Watch Demo" → `/demo`
- "Demo" (header) → `/demo`
- "Log In" → `/login`
- "Sign Up" → `/login?mode=signup`
- "Dashboard" (when authenticated) → `/home`
- Logo click → scroll to top (if on landing) or navigate to `/`
**Pass:** Each CTA navigates to the correct route; no 404s; no broken links.
**Fail:** Any CTA navigates to wrong destination or fails.
Evidence: Click-through test of every CTA button; URL bar verification.

### VAL-LAND-032: Landing Page — Authenticated vs Unauthenticated Header
When user is NOT authenticated, header shows "Log In" and "Sign Up" buttons. When user IS authenticated, header shows "Dashboard" and "Log Out" buttons instead. This applies to both desktop and mobile headers.
**Pass:** Auth state is correctly reflected in both desktop and mobile headers.
**Fail:** Wrong buttons shown for auth state; both sets shown simultaneously.
Evidence: Test with logged-in and logged-out sessions; screenshot both states.

### VAL-LAND-033: Landing Page — Scroll Indicator
A scroll indicator (animated mouse/trackpad icon with "Scroll" text) MUST appear near the bottom of the hero section, with a bouncing dot animation, visible only when user has not yet scrolled.
**Pass:** Scroll indicator animates at bottom of hero; uses orange-400 color for the dot.
**Fail:** Scroll indicator missing or uses wrong color.
Evidence: Screenshot of hero section bottom area.

---

## GREEN → ORANGE COLOR MIGRATION

### VAL-COLOR-001: Primary Accent is Orange/Amber Throughout App
The primary accent color across all UI surfaces MUST be orange/amber (hex family: `#FF6B4A`, `#f97316`, `#f59e0b`, or HSL `14 100% 64%` coral). This applies to: buttons, links, badges, progress indicators, borders, gradients, glows, and highlights.
**Pass:** Visual audit of all major surfaces confirms orange/amber as primary accent; no unexpected green/emerald used as primary accent.
**Fail:** Green/emerald used as primary accent on any non-exempt surface.
Evidence: Full-app screenshot walkthrough; grep for remaining green/emerald class usage.

### VAL-COLOR-002: Landing Page — No Green/Emerald Accents
The landing page (all sections) MUST NOT contain any green or emerald accent colors. All gradient dividers, feature highlights, badges, and decorative elements MUST use orange/amber or purple/violet.
**Pass:** Zero instances of `green-*` or `emerald-*` Tailwind classes in landing page components (excluding explicit exemptions).
**Fail:** Any green/emerald accent visible on the landing page.
Evidence: `grep -r "green\|emerald" src/components/landing/` returns zero non-exempt results; visual inspection.

### VAL-COLOR-003: Green Exemption — Online Presence Indicators
Green (`bg-green-500`) MUST be retained ONLY for online presence indicators (e.g., the green dot on user avatars in `ProfileButton`, `ProfilePopup`, `CollaboratorsPanel`). These are semantic "online status" indicators and are exempt from migration.
**Pass:** Green dots appear only on avatar indicators for online status; these are `bg-green-500` circles with size ≤ 3.5 w/h.
**Fail:** Green online dots are changed to orange; or green is used for non-status indicators.
Evidence: Identify all `bg-green-500` usage; verify each is an online status indicator.

### VAL-COLOR-004: Green Exemption — Success Checkmarks and Confirmations
Green MUST be retained for success state indicators: checkmark icons (`<Check>` with `text-green-500` or `text-green-400`), success messages (e.g., "You're subscribed!" in `NewsletterForm`), and positive transaction amounts in Credits page.
**Pass:** Success checkmarks remain green; success confirmation messages remain green-tinted; positive credit amounts remain green.
**Fail:** Success indicators changed to orange (losing semantic meaning); or non-success elements retain green.
Evidence: Audit all `<Check>` icon usages and success message styles.

### VAL-COLOR-005: Color Migration — DirectorCutPage
`DirectorCutPage.tsx` currently uses `emerald-500`, `emerald-400`, `emerald-300`, `emerald-200` extensively for borders, backgrounds, text, and buttons. These MUST be migrated to orange/amber equivalents.
**Pass:** All emerald classes in DirectorCutPage are replaced with orange/amber equivalents.
**Fail:** Any emerald accent remains in DirectorCutPage.
Evidence: `grep "emerald" src/pages/DirectorCutPage.tsx` returns zero results.

### VAL-COLOR-006: Color Migration — SettingsBillingPage
`SettingsBillingPage.tsx` uses `emerald-400`, `emerald-500`, `emerald-950`, `emerald-300` for billing UI elements. These MUST be migrated to orange/amber.
**Pass:** All emerald classes in SettingsBillingPage are replaced.
**Fail:** Emerald accents remain.
Evidence: `grep "emerald" src/pages/SettingsBillingPage.tsx` returns zero results.

### VAL-COLOR-007: Color Migration — Timeline SoundSection
`SoundSection.tsx` uses `green-400`, `green-500`, `green-600` for audio tab triggers and buttons. These MUST be migrated to orange/amber.
**Pass:** All green accent classes in SoundSection are replaced with orange/amber.
**Fail:** Green accent colors remain in SoundSection.
Evidence: `grep "green" src/components/timeline/sections/SoundSection.tsx` returns zero results.

### VAL-COLOR-008: Color Migration — Studio Nodes
Studio node components (`UploadImageNode`, `OutputNode`, `CommentNode`, `ComputeNode`, `BaseNode`) use green/emerald for selection rings, status indicators, and accent colors. Non-exempt usages MUST be migrated to orange/amber. Success checkmarks in `OutputNode` may remain green per VAL-COLOR-004.
**Pass:** All non-exempt green/emerald in studio nodes migrated to orange/amber.
**Fail:** Non-exempt green/emerald remains in studio node components.
Evidence: grep audit of `src/components/studio/nodes/` for green/emerald.

### VAL-COLOR-009: Color Migration — Studio Panels
Studio panels (`SettingsPanel`, `HistoryPanel`, `FlowsPanel`, `HelpWalkthroughPanel`, `AssetsGalleryPanel`) use green/emerald for icon colors, badges, and accent elements. These MUST be migrated to orange/amber.
**Pass:** All non-exempt green/emerald in studio panels migrated.
**Fail:** Non-exempt green/emerald remains.
Evidence: grep audit of `src/components/studio/panels/` for green/emerald.

### VAL-COLOR-010: Color Migration — Project Setup Components
Components in `src/components/project-setup/` use green/emerald in `FormatSelector` (gradient), `DynamicConceptForm` (Ad Brief Builder section), `NavigationFooter` (submit button), `StorylineProgress` (done state), and `StyleReferenceUploader`. Non-success-checkmark usages MUST be migrated to orange/amber.
**Pass:** All non-exempt green/emerald in project-setup migrated.
**Fail:** Non-exempt green/emerald remains.
Evidence: grep audit of `src/components/project-setup/` for green/emerald.

### VAL-COLOR-011: Color Migration — Editor Components
`FinalExportPanel.tsx` uses `emerald-400` for sparkle icon; `editorColors.ts` defines `accentGreen`, `activeGreen`, `playheadGreen`. These MUST be migrated to orange/amber equivalents.
**Pass:** Editor color definitions use orange/amber; FinalExportPanel sparkle uses orange/amber.
**Fail:** Green color definitions remain in `editorColors.ts`.
Evidence: Inspection of `src/lib/editorColors.ts` and `src/components/editor/FinalExportPanel.tsx`.

### VAL-COLOR-012: Color Migration — Studio Theme
`src/lib/studio/theme.ts` defines `primary: '#50EF12'` (green) and `data: '#10B981'` (green). These MUST be migrated to orange/amber equivalents.
**Pass:** `theme.ts` primary and data colors are orange/amber.
**Fail:** Green hex values remain in studio theme.
Evidence: Inspection of `src/lib/studio/theme.ts`.

### VAL-COLOR-013: Color Migration — Worldview Section
`WorldviewSection.tsx` uses `emerald-500`, `emerald-400`, `emerald-300` for tag badges and active states. Non-exempt (non-online-indicator) usages MUST be migrated. The green pulse dot for "live" status (VAL-COLOR-003 exemption) may remain green.
**Pass:** Tag badges and active states use orange/amber; only the live pulse dot remains green.
**Fail:** Non-exempt emerald accents remain in WorldviewSection.
Evidence: grep audit of WorldviewSection.tsx.

### VAL-COLOR-014: Color Migration — Home Components
Components in `src/components/home/` (`InlineEditableTitle`, `Sidebar`, `HeroSection`, `ProjectCard`, `StatCard`, `JudgePanel`, etc.) that use green/emerald for non-exempt decorative purposes MUST be migrated to orange/amber. `InlineEditableTitle`'s save button (`bg-emerald-500`) MUST become orange/amber.
**Pass:** All non-exempt green/emerald in home components migrated.
**Fail:** Non-exempt green/emerald remains.
Evidence: grep audit of `src/components/home/` for green/emerald.

### VAL-COLOR-015: Color Migration — Landing Subcomponents
Landing subcomponents (`FeatureHighlight`, `TechHighlight`, `ProductShowcase`, `WorkflowDiagram`, `TestimonialCard`, `TestimonialStream`, `PricingSection`, `PricingSectionRedesigned`, `PricingCard`, `SecureInfrastructureVisual`, `TechLogoIcon`, `FeatureGrid`, `CreativeSuiteVisual`, `Features`, `FeaturesShowcase`, `HighPerformanceVisual`) that use green/emerald MUST be migrated to orange/amber.
**Pass:** Zero non-exempt green/emerald in `src/components/landing/`.
**Fail:** Any non-exempt green/emerald remains.
Evidence: `grep -r "green\|emerald" src/components/landing/` returns only exempt usages.

### VAL-COLOR-016: Color Migration — CSS Custom Properties
`src/index.css` defines `--mog-coral` family variables. If any green-based CSS custom properties exist (check `--accent-emerald` in themes), they MUST be migrated or removed. The `light-premium.css` theme defines `--accent-emerald: 160 84% 39%` which MUST be evaluated for migration.
**Pass:** No green-based CSS custom properties remain in active themes (unless semantically justified for success states).
**Fail:** `--accent-emerald` or other green CSS vars are still used as primary accents.
Evidence: grep for green/emerald in `src/styles/` and `src/index.css`.

### VAL-COLOR-017: Color Migration — MogDocs Page
`MogDocs.tsx` uses `bg-green-500/20 text-green-400` for GET method badges. HTTP GET method badges are a convention and SHOULD be migrated to orange/amber to match the app palette (REST method colors are not universal standards).
**Pass:** GET badges use orange/amber instead of green.
**Fail:** Green GET badges remain.
Evidence: Visual inspection of MogDocs page.

### VAL-COLOR-018: Color Migration — Storyboard Components
`ShotsRow.tsx` uses `emerald-950`, `emerald-500`, `emerald-400` for completion indicators. The checkmark (✓) may be exempt per VAL-COLOR-004, but the surrounding badge/background MUST be migrated.
**Pass:** Badge backgrounds use orange/amber; only the ✓ symbol itself may remain green.
**Fail:** Emerald backgrounds remain on storyboard badges.
Evidence: grep audit of `src/components/storyboard/`.

### VAL-COLOR-019: Color Migration — Comprehensive Audit Count
The total count of non-exempt `green-*` and `emerald-*` Tailwind class usages across the `src/` directory MUST be reduced from the current ~90+ to ≤15 (accounting only for legitimate online indicators and success checkmarks).
**Pass:** `grep -r "green-\|emerald-" src/ --include="*.tsx" --include="*.ts" | wc -l` returns ≤ 15.
**Fail:** Count exceeds 15 non-exempt usages.
Evidence: grep count with manual exemption review.

### VAL-COLOR-020: Color Migration — No Visual Regression on Success States
After color migration, all success states (form submissions, upload completions, save confirmations) MUST still display green checkmarks/icons that clearly communicate "success" to the user. Migrating these to orange would lose semantic meaning.
**Pass:** Every success checkmark/icon across the app remains green; users can clearly distinguish success states from primary accent actions.
**Fail:** Success indicators are orange (confusing success with primary action); or success indicators are missing.
Evidence: Test all success flows: save project, upload asset, subscribe to newsletter, API key verification.

---

## CROSS-CUTTING CONCERNS

### VAL-LAND-040: No Console Errors on Landing Page
Loading the landing page (with and without the intro) MUST produce zero JavaScript errors or warnings in the browser console (excluding known third-party warnings).
**Pass:** Console is clean of errors; only benign third-party warnings present.
**Fail:** Any error or React warning in console during landing page load.
Evidence: Console log screenshot after full landing page load.

### VAL-LAND-041: Landing Page Lighthouse Score
The landing page MUST achieve Lighthouse scores of: Performance ≥ 70, Accessibility ≥ 90, Best Practices ≥ 90. The background video and WebGL intro may impact performance, but it must remain above threshold.
**Pass:** All Lighthouse scores meet or exceed thresholds.
**Fail:** Any score below threshold.
Evidence: Lighthouse report screenshot.

### VAL-LAND-042: Landing Page — No Horizontal Overflow
At no viewport width (320px to 2560px) should the landing page produce horizontal overflow or scrollbar.
**Pass:** `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at all tested viewports.
**Fail:** Horizontal scrollbar appears at any viewport width.
Evidence: Test at 320px, 375px, 768px, 1024px, 1440px, 1920px, 2560px.

### VAL-LAND-043: Landing Page — Reduced Motion Preference
When `prefers-reduced-motion: reduce` is set, the cinematic intro SHOULD be skipped or reduced to a simple fade-in, the background video SHOULD be paused (showing first frame as poster), and particle/wave animations SHOULD be disabled.
**Pass:** With reduced motion preference, animations are minimal or absent; no flashing or rapid motion.
**Fail:** Animations play at full intensity despite reduced motion preference.
Evidence: Enable "Reduce motion" in OS accessibility settings; reload landing page.
