
# Fix Voice Agent Concept Flow

## Problem

Two issues prevent the voice agent from filling the concept field and advancing:

1. **Stale closure**: `project_setup_next` reads `projectData.concept` from a React closure. When the model calls `set_project_setup_fields` then `project_setup_next` in the same turn, React hasn't re-rendered yet, so `projectData.concept` is still empty. The handler returns "Please give me at least a short logline" even though the concept was just set.

2. **Parallel tool dispatch**: In `useWzrdRealtimeSession.ts`, when `response.done` fires with multiple tool calls, they run via `Promise.all` (parallel). This means `project_setup_next` doesn't wait for `set_project_setup_fields` to complete.

## Changes

### 1. Add a mutable ref for projectData in ProjectSetupVoiceBridge

Keep a `useRef` that always mirrors the latest `projectData`. Voice action handlers read from this ref instead of the closure value, ensuring they always see the most recent state even before React re-renders.

**File**: `src/components/project-setup/ProjectSetupVoiceBridge.tsx`
- Add `const projectDataRef = useRef(projectData)` and sync it with `useEffect`
- In `set_project_setup_fields` handler, after calling `updateProjectData(fields)`, also update `projectDataRef.current` with the merged fields so subsequent tool calls in the same tick see them
- In `project_setup_next` handler, read `projectDataRef.current.concept` instead of `projectData.concept`

### 2. Serialize tool calls in the same response turn

**File**: `src/voice/realtime/useWzrdRealtimeSession.ts`
- In the `response.done` handler, change `Promise.all(toolCalls.map(executeToolCall))` to a sequential loop: `for (const call of toolCalls) { await executeToolCall(call); }`. This ensures `set_project_setup_fields` completes and updates the ref before `project_setup_next` runs.

### 3. No backend or schema changes required
