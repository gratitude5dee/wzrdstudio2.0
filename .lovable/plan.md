
# Fix Realtime Voice Logline Save

## Problem

When the voice agent sets `concept` via `set_project_setup_fields`, the value is written to `projectDataRef.current` (eager) and `updateProjectData` (async React state). But `saveProjectData()` in `ProjectContext` reads from `projectData` (React state), which hasn't flushed yet. So the concept is lost on save.

Secondary issue: the voice model may pass `logline`, `text`, or `prompt` instead of `concept`.

## Changes

### 1. `src/components/project-setup/ProjectContext.tsx` — Accept overrides in `saveProjectData`

- Change signature: `saveProjectData(overrides?: Partial<ProjectData>) => Promise<string | null>`
- Update the interface and implementation to merge overrides: `const merged = { ...projectData, ...overrides }`
- Use `merged` instead of `projectData` when building `projectPayload`
- Same change for `generateStoryline`: accept optional `conceptOverride?: string` so the edge function receives the correct concept text

### 2. `src/components/project-setup/ProjectSetupVoiceBridge.tsx` — Normalize input and pass overrides

- Add a small `normalizeConceptInput` helper that maps `logline`, `text`, `description`, `prompt` → `concept` (keeps all other known `ProjectData` keys)
- In `set_project_setup_fields` handler: normalize input before calling `updateProjectData` and updating `projectDataRef`
- Pass the normalized fields as overrides to `saveProjectData(fields)` and `generateStoryline(savedProjectId)` so they don't depend on React state
- In `project_setup_next` handler (concept tab): pass `projectDataRef.current` as overrides to `saveProjectData({ ...projectDataRef.current })` so the eagerly-updated concept is saved
- Accept inline `concept`/`logline` in `project_setup_next` input, merge into ref before save

### 3. `src/voice/agent.ts` — Minor prompt reinforcement

- In the Concept Page instructions, add: "Always use the key `concept` (not `logline` or `text`) when calling set_project_setup_fields."

No database or edge function changes needed.
