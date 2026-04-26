---
name: fullstack-worker
description: Implements features spanning frontend and backend — end-to-end flows, service architecture, integrated features
---

# Fullstack Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill
- Features requiring both UI and Edge Function changes
- End-to-end generation flow improvements
- Unified generation service architecture
- Director's Cut optimization (UI + backend)
- Voice clone integration (UI popup + Edge Function)
- Document upload features (UI drop zone + Edge Function parsing)

## Work Procedure

1. **Read feature description** thoroughly. Check `AGENTS.md` for constraints and `.factory/library/` for relevant context.

2. **Plan the implementation**:
   - Identify which files need changes (UI components, services, edge functions, stores)
   - Determine the data flow: UI → service → edge function → external API → storage → UI
   - Check existing patterns in both frontend and backend

3. **Write tests first** (when applicable):
   - Unit tests for service logic and utility functions
   - Component render tests for new UI
   - Run `npm run test` to confirm tests fail (red phase)

4. **Implement backend first, then frontend**:
   - Edge functions: follow `supabase/functions/_shared/` patterns (CORS, auth, error handling)
   - Client services: follow `src/services/` object literal pattern
   - UI components: follow shadcn/ui + Tailwind + Framer Motion patterns
   - Stores: follow Zustand v5 with devtools pattern

5. **Run tests** (green phase): `npm run test` — all new tests pass

6. **Run validators**:
   - `npx tsc --noEmit` — typecheck passes
   - `npm run lint` — lint passes

7. **End-to-end manual verification with agent-browser**:
   - Start dev server if not running: check `curl -sf http://localhost:8080` first
   - Navigate to the relevant page
   - Exercise the full flow (UI → backend → result displayed)
   - Take screenshots as evidence
   - Check network requests for correct payloads
   - Check browser console for errors

8. **Update shared knowledge**: add to `.factory/library/`

## Example Handoff

```json
{
  "salientSummary": "Implemented voice clone upload: new VoiceCloneDialog component with audio file validation (30s-5min, MP3/WAV), progress tracking, and ElevenLabs integration via existing elevenlabs-voices edge function. Added clone action handler. Ran tests (5 new pass), typecheck clean, verified in browser — upload popup works, progress shown, cloned voice appears in voice list.",
  "whatWasImplemented": "VoiceCloneDialog.tsx in src/components/project-setup/ with audio upload, validation, progress UI. Modified elevenlabs-voices edge function to handle 'clone' action with multipart audio upload. Updated SettingsTab.tsx to include Clone Voice button that opens dialog. On success, voice ID stored and auto-selected.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm run test", "exitCode": 0, "observation": "272 tests pass including 5 new" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "Clean" },
      { "command": "npm run lint", "exitCode": 0, "observation": "Clean" }
    ],
    "interactiveChecks": [
      { "action": "Click Clone Voice on Settings tab", "observed": "Dialog opens with explanation text and upload area" },
      { "action": "Upload 2-second audio clip", "observed": "Validation error: Audio must be at least 30 seconds" },
      { "action": "Upload valid 45-second WAV", "observed": "Progress bar shown, upload completes, success toast, new voice in list" }
    ]
  },
  "tests": {
    "added": [
      { "file": "src/components/project-setup/__tests__/VoiceCloneDialog.test.tsx", "cases": [
        { "name": "renders upload area when open", "verifies": "Dialog opens" },
        { "name": "rejects files under min duration", "verifies": "Duration validation" },
        { "name": "shows progress during upload", "verifies": "Progress state" },
        { "name": "calls onSuccess with voice ID", "verifies": "Completion callback" },
        { "name": "displays error on API failure", "verifies": "Error handling" }
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator
- Edge Function deployment requires SUPABASE_ACCESS_TOKEN which may not be set
- Database schema changes needed (new tables/columns not in existing migrations)
- External API credentials missing or expired
- Requirements span more than 2 pages/routes (scope too large for single worker)
