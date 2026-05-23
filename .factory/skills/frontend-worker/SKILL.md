---
name: frontend-worker
description: Implements UI/UX features — React components, animations, Tailwind styling, Zustand stores
---

# Frontend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill
- UI component creation or modification
- Animation implementation (Framer Motion, Three.js, CSS)
- Tailwind CSS styling changes (including color migrations)
- Zustand store creation or modification
- Frontend-only feature implementation

## Work Procedure

1. **Read feature description** thoroughly. Check `AGENTS.md` for constraints and `.factory/library/` for relevant context.

2. **Write tests first** (when applicable):
   - For utility functions, stores, and logic: write Vitest unit tests that fail before implementation
   - For components: write render tests using @testing-library/react
   - Run `npm run test` to confirm tests fail (red phase)

3. **Implement the feature**:
   - Follow existing patterns: shadcn/ui primitives, Tailwind CSS with `cn()`, Framer Motion for animations, lucide-react for icons
   - Use `@/` path aliases for imports
   - Match existing code style in the file you're editing
   - For new components: place in the appropriate subdirectory under `src/components/`
   - For stores: follow Zustand v5 pattern with devtools middleware in `src/store/` or `src/lib/stores/`

4. **Run tests** (green phase): `npm run test` — all new tests pass

5. **Run validators**:
   - `npx tsc --noEmit` — typecheck passes
   - `npm run lint` — lint passes

6. **Manual verification with agent-browser**:
   - Start dev server if not running: check `curl -sf http://localhost:8080` first
   - Navigate to the relevant page
   - Verify the feature works visually
   - Take screenshots as evidence
   - Check browser console for errors

7. **Update shared knowledge** if you discovered patterns or gotchas: add to `.factory/library/architecture.md`

## Example Handoff

```json
{
  "salientSummary": "Replaced LobsterIntro with WebGL Three.js cinematic logo reveal using wzrdtechlogo.png. Lazy-loaded via React.lazy to keep out of main bundle. Ran `npm run test` (4 new tests pass), `npx tsc --noEmit` (clean), verified in browser — intro plays on first visit, skippable, auto-dismisses after 5s.",
  "whatWasImplemented": "New CinematicIntro component at src/components/landing/CinematicIntro.tsx with Three.js Canvas, custom GLSL shader for logo dissolve reveal, Bloom post-processing, Framer Motion sequencing. Replaced LobsterIntro import in Landing.tsx. Added React.lazy wrapper in App.tsx.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm run test", "exitCode": 0, "observation": "267 tests pass including 4 new intro tests" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "Clean typecheck" },
      { "command": "npm run lint", "exitCode": 0, "observation": "No lint errors" }
    ],
    "interactiveChecks": [
      { "action": "Navigate to http://localhost:8080/ with fresh session (cleared sessionStorage)", "observed": "WebGL canvas renders, logo reveal animation plays with bloom effects, auto-dismisses after ~5s revealing landing page" },
      { "action": "Click during intro animation at 2s mark", "observed": "Intro dismisses within 600ms, landing page fully visible" },
      { "action": "Reload page (same session)", "observed": "Intro does not replay, landing page renders immediately" }
    ]
  },
  "tests": {
    "added": [
      { "file": "src/components/landing/__tests__/CinematicIntro.test.tsx", "cases": [
        { "name": "renders WebGL canvas on mount", "verifies": "Canvas element present in DOM" },
        { "name": "calls onComplete after animation", "verifies": "Callback fires after sequence" },
        { "name": "dismisses on click", "verifies": "Skip behavior works" },
        { "name": "respects sessionStorage flag", "verifies": "Does not render when flag set" }
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator
- Feature depends on a Supabase Edge Function that doesn't exist yet
- Feature requires new npm dependencies not yet installed
- Requirements are ambiguous or contradictory
- Existing bugs in the codebase block implementation
- Color migration scope is unclear for specific components
