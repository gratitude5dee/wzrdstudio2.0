---
name: backend-worker
description: Implements backend features — Supabase Edge Functions, generation services, API integrations, prompt engineering
---

# Backend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill
- Supabase Edge Function creation or modification
- Generation service/pipeline architecture
- fal.ai model integration and prompt engineering
- Document parsing (PDF/DOCX) edge functions
- API integration (ElevenLabs, Groq, Gemini)
- Unified generation service layer

## Work Procedure

1. **Read feature description** thoroughly. Check `AGENTS.md` for constraints and `.factory/library/` for relevant context.

2. **Understand existing patterns**:
   - Edge functions live in `supabase/functions/<name>/index.ts` (Deno runtime)
   - Shared helpers in `supabase/functions/_shared/` (authenticateRequest, corsHeaders, errorResponse, successResponse, handleCors)
   - Client-side services in `src/services/` (object literal pattern)
   - fal.ai proxy: `supabase/functions/fal-proxy/`, `fal-stream/`, `falai-execute/`
   - Model catalog: `src/lib/studio-model-constants.ts`

3. **Write tests first** (when applicable):
   - For client-side service logic: Vitest unit tests
   - For edge function shared utilities: tests in `supabase/functions/_shared/`
   - Run `npm run test` to confirm tests fail (red phase)

4. **Implement the feature**:
   - Edge functions: follow existing CORS/auth/error patterns from `_shared/`
   - Use `npm:` specifiers for npm packages in Deno edge functions (e.g., `import pdf from "npm:unpdf"`)
   - For generation prompts: use structured JSON with explicit field mapping
   - For client-side services: follow existing object literal pattern
   - Never hardcode API keys — use Deno.env.get() in edge functions, import.meta.env in client

5. **Run tests** (green phase): `npm run test` — all new tests pass

6. **Run validators**:
   - `npx tsc --noEmit` — typecheck passes
   - `npm run lint` — lint passes

7. **Manual verification**:
   - For edge functions: test via the dev server (edge functions are called through Supabase client)
   - Use agent-browser to navigate to the page that calls the edge function
   - Verify the feature works end-to-end
   - Check network requests in browser DevTools

8. **Update shared knowledge**: add patterns or gotchas to `.factory/library/architecture.md` or `.factory/library/environment.md`

## Example Handoff

```json
{
  "salientSummary": "Created document-parse Edge Function that accepts PDF/DOCX uploads, extracts text using unpdf/mammoth, returns content. Updated DynamicConceptForm to accept PDF/DOCX and call the new function. Ran `npm run test` (3 new tests pass), `npx tsc --noEmit` (clean), verified PDF upload in browser — text populates concept textarea.",
  "whatWasImplemented": "New Edge Function supabase/functions/document-parse/index.ts handling multipart uploads. Uses npm:unpdf for PDF, npm:mammoth for DOCX. Updated DynamicConceptForm.tsx file input accept to include .pdf,.docx. Added loading state and error handling.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm run test", "exitCode": 0, "observation": "270 tests pass including 3 new service tests" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "Clean typecheck" }
    ],
    "interactiveChecks": [
      { "action": "Upload a 3-page PDF in concept custom form", "observed": "Loading spinner shown, text extracted and populated in textarea after 2s" },
      { "action": "Upload a corrupt PDF", "observed": "Error toast: Failed to parse document. Textarea unchanged." }
    ]
  },
  "tests": {
    "added": [
      { "file": "src/services/__tests__/documentService.test.ts", "cases": [
        { "name": "parses PDF response into text", "verifies": "PDF extraction result handling" },
        { "name": "handles parse errors gracefully", "verifies": "Error state management" },
        { "name": "rejects files exceeding size limit", "verifies": "Client-side validation" }
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator
- Edge Function deployment requires SUPABASE_ACCESS_TOKEN which may not be set
- External API (fal.ai, ElevenLabs) returns unexpected errors
- Database schema changes are needed (new tables, columns)
- Requirements for prompt structure are ambiguous
