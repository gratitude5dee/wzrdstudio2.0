---
name: worldview-worker
description: Implements Worldview feature components — types, stores, services, edge functions, and UI components for the 3D World Shot Compositor.
---

# Worldview Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for all Worldview feature implementation: TypeScript types, Zustand store, API services, Supabase edge functions, React UI components, KanvasPage integration, and polish/refinement work.

## Work Procedure

### 1. Understand the Feature

Read the feature description, preconditions, expectedBehavior, and verificationSteps carefully. Read `.factory/library/architecture.md` for codebase patterns and `AGENTS.md` for boundaries.

### 2. Examine Existing Code

Before writing any code, read the files you'll be working with or near:
- For types/store/service: read `src/types/worldview.ts`, `src/lib/stores/worldview-store.ts`, `src/services/worldLabsService.ts` (if they exist from prior features)
- For UI: read `src/components/worldview/WorldviewSection.tsx` (if it exists)
- For integration: read `src/features/kanvas/types.ts`, `src/features/kanvas/helpers.ts`, `src/pages/KanvasPage.tsx`
- For edge functions: read `supabase/functions/_shared/auth.ts`, `supabase/functions/_shared/response.ts`, and one existing function (e.g., `fal-proxy/index.ts`) to match the pattern

### 3. Write Tests First (Red Phase)

Write failing tests BEFORE implementation:
- **Store tests**: Test each action modifies state correctly. File: `src/lib/stores/__tests__/worldview-store.test.ts`
- **Service tests**: Test function signatures and error handling (mock fetch/supabase). File: `src/services/__tests__/worldLabsService.test.ts`
- **UI tests**: For UI features, write basic render tests. File alongside component or in `__tests__/`.

Use vitest conventions:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

Run tests to confirm they fail: `npm run test -- --run`

### 4. Implement (Green Phase)

Implement the feature to make tests pass. Follow these patterns strictly:

**CRITICAL CONSTRAINTS:**
- NEVER run `npm install` or any package manager install command
- Use `@/` alias for all cross-directory imports
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes
- Use `sonner` `toast` for notifications
- Use Framer Motion `motion` and `AnimatePresence` for animations
- Follow the amber/gold theme for Worldview UI (see AGENTS.md Design Language)

**For new files:** Create them in the exact locations specified in the feature description.
**For modifications:** Only modify the specific files listed in AGENTS.md "Files allowed to be modified."

### 5. Run Automated Checks

Run all three in sequence:
```bash
npx tsc --noEmit           # Must pass with zero errors
npm run test -- --run       # Must not break existing tests
npm run lint                # Must not introduce NEW errors
```

If typecheck fails, fix the errors. If tests fail on YOUR new tests, fix the implementation. If lint shows new errors from your files, fix them. Pre-existing failures (connectionValidator.test.ts, 694 lint errors) are not your concern.

### 6. Manual Verification (UI Features Only)

If the feature includes UI components:
1. Check if the dev server is running on port 8080: `curl -sf http://localhost:8080`
2. If not running, start it: `VITE_BYPASS_AUTH_FOR_TESTS=true npx vite --port 8080 &` and wait for it
3. Use agent-browser to navigate to `http://localhost:8080/kanvas?studio=worldview`
4. Verify each expectedBehavior item visually
5. Take screenshots as evidence
6. Record each check as an `interactiveChecks` entry in the handoff

For non-UI features (types, store, service, edge function): skip this step.

### 7. Commit

Stage and commit all changes with a descriptive message. Do not commit lock files or unrelated changes.

## Example Handoff

```json
{
  "salientSummary": "Implemented WorldviewSection with SceneStrip and WorldviewCanvas grid. Created 4 sub-components: SceneChip, WorldCreatorPanel, WorldCard, TakeCard. Verified via agent-browser: new scene creation, world creator panel opening, amber theme applied. TypeScript clean, 12 new tests passing.",
  "whatWasImplemented": "WorldviewSection.tsx with SceneStrip (horizontal scrollable scene chips with amber active state), WorldviewCanvas (grid view with WorldCreatorPanel text/image toggle, WorldGeneratingCard progress, WorldCard hover reveal, TakeCard grid-cols-3, GeneratedImageCard grid-cols-2, bottom prompt bar). Integrated into KanvasPage via STUDIO_ICONS and conditional rendering for studio='worldview'. Updated KanvasStudio type and helpers.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "Zero type errors" },
      { "command": "npm run test -- --run", "exitCode": 0, "observation": "215 tests passing (6 new), 2 pre-existing failures unchanged" },
      { "command": "npm run lint", "exitCode": 1, "observation": "694 errors — all pre-existing, zero new errors from worldview files" }
    ],
    "interactiveChecks": [
      { "action": "Navigated to /kanvas?studio=worldview", "observed": "Worldview tab active with amber icon, scene strip visible with New Scene button" },
      { "action": "Clicked New Scene button", "observed": "Scene chip appeared in strip with amber highlight, Create 3D World CTA visible" },
      { "action": "Clicked Create a 3D World CTA", "observed": "World creator panel opened with textarea, model selector, Generate World button" },
      { "action": "Clicked Generate World with empty prompt", "observed": "Validation prevented submission — button remained disabled" },
      { "action": "Entered prompt and clicked Generate World", "observed": "API call fired, error toast appeared (expected — no API key configured)" }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src/lib/stores/__tests__/worldview-store.test.ts",
        "cases": [
          { "name": "addScene creates scene and sets it active", "verifies": "Scene creation and activation" },
          { "name": "removeScene deletes scene and activates another", "verifies": "Scene deletion with fallback activation" },
          { "name": "setMode switches between canvas/world-viewer/shot-composer", "verifies": "Mode switching" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A precondition is not met (e.g., a file that should exist from a prior feature does not exist)
- The KanvasPage structure has changed in unexpected ways that make the integration unclear
- The Supabase client or edge function shared helpers have a different API than documented
- An existing test breaks and you cannot determine if your change caused it
- The scope of the feature exceeds what can be done in a single session (estimate >3 hours of work)
