# User Testing

Testing surface, validation approach, and resource cost classification.

**What belongs here:** How to test the feature manually, what surfaces to use, setup requirements, gotchas.

---

## Validation Surface

**Primary surface:** Web browser via agent-browser
**Base URL:** http://localhost:8080
**Auth bypass:** Dev server must be started with `VITE_BYPASS_AUTH_FOR_TESTS=true`

### Key Routes to Test
- `/` — Landing page (intro animation, video background, card layout)
- `/home` — Dashboard (project list, create project)
- `/project-setup` — Project creation wizard (5 steps)
- `/projects/:projectId/studio` — Node-based workflow editor
- `/projects/:projectId/timeline` — Storyboard/timeline
- `/projects/:projectId/editor` — Video editor
- `/projects/:projectId/directors-cut` — Final video assembly

### Setup Procedure
1. Stop any existing dev server on port 8080: `lsof -ti :8080 | xargs kill -9 2>/dev/null || true`
2. Start dev server with auth bypass: `cd /Users/gratitud3/Downloads/mogstudio-repo && VITE_BYPASS_AUTH_FOR_TESTS=true ./node_modules/.bin/vite --port 8080 &`
3. Wait for healthcheck: `curl -sf http://localhost:8080` (retry up to 30s)
4. Navigate to the route being tested

### Known Limitations
- **WebGL not available in headless Chromium**: The CinematicIntro (Three.js logo reveal) cannot be visually verified via agent-browser in headless mode. The component correctly falls back (skips intro) when WebGL is unavailable. WebGL-dependent assertions (VAL-LAND-001) should be tested with `--headed` flag or marked as requiring real browser testing.

### Known Limitations
- WORLDLABS_API_KEY is not configured — world generation API calls will fail with error toast
- fal-proxy may fail without proper auth — shot generation will show error state
- GSplat viewer uses placeholder rendering (2D image, not real 3D splats)
- All Worldview state is in-memory (Zustand store without persist) — refreshing the page clears all data

### Testing Tips
- To test world cards and takes, the store needs to be populated. Workers should add test helpers or the validator can use browser console to manually set store state.
- The worldview store is accessible via `window.__ZUSTAND_DEVTOOLS__` if devtools is enabled.

## Validation Concurrency

**Machine:** 24GB RAM, 12 CPU cores
**Surface:** agent-browser (web)

Each agent-browser instance uses ~300MB RAM. The dev server adds ~200MB.
With ~6GB baseline usage, usable headroom = (24 - 6) * 0.7 = ~12.6 GB.
5 instances = ~1.5GB + ~200MB dev server = ~1.7GB — well within budget.

**Max concurrent validators: 5**

## Flow Validator Guidance: Web Browser (agent-browser)

### Isolation Rules
- Each subagent MUST use a unique browser session: `--session "ba5792be7323__<group-id>"`
- Each browser session is isolated — Zustand store state is per-tab, no cross-tab contamination
- Subagents must NOT close or navigate away from their assigned browser tab during testing
- The dev server is shared but read-only from the browser perspective — no server-side mutations

### Testing Approach
1. Navigate to `http://localhost:8080/kanvas?studio=worldview`
2. The page loads with the Worldview tab — all state starts fresh (empty Zustand store)
3. Interact with UI elements to test assertions
4. Use screenshots as evidence for each assertion
5. Check browser console for errors (especially unhandled promise rejections)

### Store Manipulation
- The Zustand store can be accessed via browser console for seeding test state
- To access the worldview store: use `const storeModule = await import('/src/lib/stores/worldview-store.ts'); const store = storeModule.useWorldviewStore;`
- **IMPORTANT:** Use proper store actions (addWorld, assignWorldToScene, addTake, addGeneratedShot) instead of flat setState. The World type uses nested structure (displayName, assets.thumbnailUrl, etc.) that differs from simple flat objects.
- Example correct seeding:
  ```javascript
  store.getState().addWorld({ id: 'test-world-1', displayName: 'Test World', status: 'ready', model: 'Marble 0.1-plus', prompt: 'test', assets: { thumbnailUrl: 'https://placehold.co/600x400', panoramaUrl: null, videoUrl: null }, viewerUrl: 'https://example.com', createdAt: new Date().toISOString() });
  store.getState().assignWorldToScene(activeId, 'test-world-1');
  store.getState().addTake(activeId, { id: 'test-take-1', worldId: 'test-world-1', imageUrl: 'https://placehold.co/400x300', camera: { lens: '35mm', aperture: 'f/1.8', aspectRatio: '16:9', zoom: 100, transform: { position: {x:0,y:0,z:5}, rotation: {x:0,y:0,z:0} } }, status: 'ready', createdAt: new Date().toISOString() });
  ```
- For assertions that need pre-existing data (world cards, takes), create scenes and trigger flows first through the UI, or use the store actions approach above

### What to Report
Each subagent writes a JSON flow report with:
- `assertions`: array of `{id, status: "pass"|"fail"|"blocked", evidence, notes}`
- `frictions`: difficulties encountered during testing
- `blockers`: things that prevented testing
- `toolsUsed`: tools/skills invoked

### Error Handling Expectations
- API calls to worldlabs-proxy WILL fail (no API key) — this is expected
- The test checks that errors are handled GRACEFULLY (toast notification, no crash, no unhandled errors)
- Console errors from failed API calls are acceptable; unhandled promise rejections are NOT

### Scene State Isolation (Resolved in Round 3)
- `generationError` and `showCreator` are now stored as per-scene state in the Zustand store (`setSceneGenerationError`, `setSceneShowCreator` actions), keyed by scene ID.
- Both states are properly isolated between scenes — switching scenes preserves each scene's state independently.
- Validated in user-testing round 3 (VAL-CROSS-006 passed).

### addTake Store API
- The `addTake` store method accepts a single take object that MUST include a `sceneId` field. It is NOT `addTake(sceneId, takeObj)` — use `addTake({ sceneId, ...takeFields })` instead.

## Flow Validator Guidance: Video Editor (agent-browser)

### Isolation Rules
- Each subagent MUST use a unique browser session: `--session "690cc20b1a16__<group-id>"`
- Each browser session is isolated — Zustand store state is per-tab, no cross-tab contamination
- The dev server is shared but read-only from the browser perspective

### Video Editor Testing Approach
1. Navigate to `http://localhost:8080/home` first (auth is bypassed)
2. The editor requires a project ID. Navigate to `http://localhost:8080/projects/test-project/editor` (may show empty state)
3. Or create a project first and navigate to its editor
4. The editor has: left asset panel, center preview (Remotion), timeline at bottom, right properties panel
5. Take screenshots as evidence for each assertion
6. Check browser console for errors

### Key Editor Features to Test
- **Preview**: Should use Remotion composition (not placeholder text). Look for `<canvas>` or Remotion Player element.
- **Asset Panel**: Left sidebar should show project assets from Supabase
- **Timeline**: Tracks with clips, draggable, trimmable
- **Properties Panel**: Right sidebar with opacity, position, scale controls
- **Playback**: Play/pause/seek controls synced with timeline playhead
- **Transitions**: Transitions tab should offer fade/dissolve effects
- **Empty State**: Editor with no assets should show appropriate message, not blank/broken UI

### Handling Missing API Keys / Supabase Data
- Supabase auth is bypassed, but real project data may not exist
- Asset loading depends on Supabase Storage — may return empty array without real data
- Focus on UI structure, component rendering, and interaction patterns
- Empty state handling is explicitly tested (VAL-EDITOR-010)
- Generation flow testing (VAL-GEN-002/003) should verify the service layer exists and handles requests, even if API calls fail

## Flow Validator Guidance: Generation Architecture (code inspection)

### Testing Approach
- VAL-GEN-001 through VAL-GEN-005 are primarily about the existence and structure of the unified generation service
- These can be tested through code inspection (file existence, exports, schema validation) combined with browser testing
- Navigate to project-setup and studio to verify generation flows still work (UI sends requests correctly)
- Check SKILL.md file exists and is comprehensive

### Key Files to Inspect
- `src/lib/services/generation/` — unified generation service directory
- `src/lib/studio-model-constants.ts` — model catalog
- `SKILL.md` — documentation file
- Check that project-setup, studio, and editor generation flows import from the unified service

## Flow Validator Guidance: Cross-area Constraints (mixed)

### Testing Approach
- VAL-CROSS-003: Navigate between Studio, Timeline, Editor for same project — verify URL consistency
- VAL-CROSS-004: Check that studio-generated assets appear in editor asset panel
- VAL-CROSS-007: Credits display in AppHeader — verify consistency across pages
- VAL-CROSS-008: Verify public/lovable-uploads/ files exist and package.json has lovable-tagger
- VAL-CROSS-009: Verify src/integrations/supabase/client.ts uses env vars unchanged
- VAL-CROSS-010: Smoke test major flows (project creation, studio nodes, storyboard)
- VAL-CROSS-011: Navigate to /kanvas, verify it renders, check git diff for kanvas files
- VAL-CROSS-014: Grep src/ for hardcoded secrets/API keys

## Flow Validator Guidance: Project Setup (agent-browser)

### Isolation Rules
- Each subagent MUST use a unique browser session: `--session "5e9570cd7db5__<group-id>"`
- Each browser session is isolated — Zustand store state is per-tab, no cross-tab contamination
- The dev server is shared but read-only from the browser perspective

### Project Setup Testing Approach
1. Navigate to `http://localhost:8080/home` first to access the dashboard
2. Create a new project by clicking "Create Project" to enter the project-setup wizard
3. The wizard has 5 tabs/steps: Concept, Storyline, Settings & Cast, Breakdown, Timeline
4. Auth is bypassed with `VITE_BYPASS_AUTH_FOR_TESTS=true`
5. Take screenshots as evidence for each assertion
6. Check browser console for errors

### Key Testing Notes
- **Credit Costs**: Model dropdowns should show "{model.name} ({model.credits} credits)" format
- **Document Upload**: The concept form accepts .pdf, .docx, .md, .txt files; TXT/MD are read client-side, PDF/DOCX via edge function
- **Format-Specific UIs**: Different project formats (Short Film, Commercial, Music Video, Infotainment) have different form fields
- **Storyline Tab**: Has typewriter animation for AI-generated text and document upload
- **Voice Clone**: Settings & Cast tab has a "Clone Voice" button that opens a dialog
- **Breakdown**: Scene cards should animate in with staggered fade-up effect
- **Timeline**: Should include all prior step data, persist state across regeneration, show credit costs on buttons
- **Director's Cut**: Triggers full pipeline with progress tracking; requires real project data to fully test
- **Edge Functions**: Calls to fal.ai and ElevenLabs require API keys — UI/UX and error handling can still be validated without them
- **Supabase Storage**: Asset storage requires live Supabase connection — verify the UI attempts to save assets

### What to Report
Each subagent writes a JSON flow report with:
- `assertions`: array of `{id, status: "pass"|"fail"|"blocked", evidence, notes}`
- `frictions`: difficulties encountered during testing
- `blockers`: things that prevented testing
- `toolsUsed`: tools/skills invoked

## Flow Validator Guidance: Landing Page (agent-browser)

### Isolation Rules
- Each subagent MUST use a unique browser session: `--session "1dcc008a7d12__<group-id>"`
- Each browser session is isolated — sessionStorage is per-session
- The dev server is shared but read-only from the browser perspective

### Landing Page Testing Approach
1. Navigate to `http://localhost:8080/` for landing page tests
2. For intro tests: clear sessionStorage first (`sessionStorage.removeItem('mog-intro-seen')`) to trigger intro replay
3. For color tests: use grep/code inspection in combination with visual screenshots
4. Use `--headed` flag for WebGL-related assertions (Three.js intro)
5. Take screenshots as evidence for each assertion
6. Check browser console for errors

### WebGL / Three.js Intro Testing
- The CinematicIntro uses Three.js WebGL canvas. In headless Chromium, WebGL may not be available.
- Use `--headed` flag for assertions that need WebGL rendering (VAL-LAND-001, VAL-LAND-002, VAL-LAND-005)
- The component has a WebGL fallback path — if WebGL fails, it skips the intro gracefully
- `mog-intro-seen` sessionStorage flag controls whether intro replays
- Intro auto-dismisses after ~5s or on any click

### Color Migration Testing
- Color migration assertions can be partially tested via code grep (non-browser)
- Use `rg` or `grep` on src/ directory to count green/emerald Tailwind classes
- Exempt patterns: `bg-green-500` for online indicators, `text-green-500/400` for success checkmarks
- Visual verification via browser screenshots on key pages (landing, home, studio)

### Key Routes for Landing Polish Milestone
- `/` — Landing page (intro, video background, card layout, CTAs, sections)
- `/home` — Dashboard (after auth bypass, check color consistency)
- Loading screen appears on initial page load briefly

## Flow Validator Guidance: Studio Page (agent-browser)

### Isolation Rules
- Each subagent MUST use a unique browser session: `--session "9b5338f298aa__<group-id>"`
- Each browser session is isolated — Zustand store state is per-tab, no cross-tab contamination
- The dev server is shared but read-only from the browser perspective
- All assertions operate on a fresh studio canvas; no persistent state between groups

### Studio Page Testing Approach
1. Navigate to `http://localhost:8080/home` first (auth is bypassed)
2. A test project is needed to access the studio. Either:
   a. Create a new project from the dashboard (click "Create Project")
   b. Or navigate directly to a studio URL like `http://localhost:8080/projects/test-project/studio`
3. The studio page renders the ReactFlow node editor with a palette sidebar
4. Take screenshots as evidence for each assertion
5. Check browser console for errors

### Key Studio Features to Test
- **Node Palette**: Left sidebar with available nodes; click to add to canvas. FFmpeg nodes should be listed.
- **Node Descriptions**: Each node type shows a one-line description in palette/tooltip.
- **UI Layout**: Shortcuts button position, queue indicator position, workflow generator as right panel tab.
- **Edge Validation**: Connect/reject edges between nodes. Incompatible types flash red with tooltip.
- **Node Execution**: Nodes transition through idle → queued → running → succeeded/failed. Requires fal.ai keys for real execution (which are not available locally — focus on UI state transitions).
- **Workflow Generator**: Right panel tab with chatbox, autocomplete, settings menu. Generates nodes on canvas.
- **Compute Flow**: Data flows through connected edges from source to target nodes.

### Handling Missing API Keys
- fal.ai and Groq API keys may not be available locally
- Node execution (VAL-STUDIO-008) can be tested by verifying the UI triggers execution and handles the error gracefully
- Workflow generation (VAL-STUDIO-007, VAL-STUDIO-015) requires the generate-workflow edge function — test that the UI sends the request and handles response/error
- Focus on **UI behavior** and **visual feedback** rather than successful API responses

### What to Report
Each subagent writes a JSON flow report with:
- `assertions`: array of `{id, status: "pass"|"fail"|"blocked", evidence, notes}`
- `frictions`: difficulties encountered during testing
- `blockers`: things that prevented testing
- `toolsUsed`: tools/skills invoked
