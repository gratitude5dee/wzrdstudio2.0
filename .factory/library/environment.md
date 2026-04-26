# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Client-Side Environment Variables

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key
- `VITE_BYPASS_AUTH_FOR_TESTS` — Set to `true` to bypass auth wall in dev mode

## Edge Function Environment Variables

- `SUPABASE_URL` — Supabase project URL (set automatically)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (set automatically)
- `FAL_KEY` — fal.ai API key (configured in Supabase secrets)
- `GROQ_API_KEY` — Groq API key for LLM text generation (configured in Supabase secrets)
- `GEMINI_API_KEY` — Google Gemini API key for structured generation (configured in Supabase secrets)
- `ELEVENLABS_API_KEY` — ElevenLabs API key for voice/TTS (configured in Supabase secrets)
- `WORLDLABS_API_KEY` — WorldLabs Marble API key (NOT YET CONFIGURED — build with graceful error handling)

## CLI / Deployment Environment Variables

- `SUPABASE_ACCESS_TOKEN` — Required for `npx supabase functions deploy`. Not set in current environment — edge function deployment will fail without it. Workers should write edge functions locally but may not be able to deploy.

## Supabase Client

Located at: `src/integrations/supabase/client.ts`
Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
DO NOT MODIFY this file's env var references.

## External APIs

- **fal.ai**: Image/video/audio generation. Proxied through `fal-proxy`, `fal-stream`, `falai-execute` edge functions.
- **Groq**: LLM text generation (llama-3.3-70b-versatile). Via `groq-chat`, `groq-stream` edge functions.
- **Google Gemini**: Structured JSON generation. Via `gemini-storyline-generation`, `gemini-text-generation`, `gemini-image-generation` edge functions.
- **ElevenLabs**: Voice synthesis and TTS. Via `elevenlabs-voices`, `elevenlabs-tts`, `elevenlabs-sfx`, `elevenlabs-music` edge functions.
- **WorldLabs Marble API**: `https://api.worldlabs.ai` — 3D world generation (not used in this mission).

## Supabase Storage Buckets

- `project-assets` — Project-level generated assets (shot images, videos)
- `project-media` — User-uploaded media items for the video editor
- `final-exports` — Director's Cut exported videos
- `worldview-takes` — Worldview captured take images

## New Dependencies (This Mission)

- `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` — WebGL cinematic intro (Milestone 1)
- `web-audio-beat-detector` — Client-side BPM detection for Music Video format (Milestone 2)
- These must be installed via `npm install` before features that use them.

### React 18 ↔ Three.js Version Constraints

- `@react-three/fiber` v9+ requires React 19. For React 18 compatibility, pin to v8.x (e.g., `^8.18.0`).
- `@react-three/drei` v9.x and `@react-three/postprocessing` v2.x are compatible with React 18.
- `@types/three` is NOT installed. TypeScript check passes because `@react-three/*` packages bundle their own Three.js type references. If a worker imports directly from `'three'` in new files, they should verify types resolve correctly.

## Pre-Existing Lint Errors

The project has ~765 pre-existing lint errors (705 errors, 60 warnings) from `npm run lint`. These are spread across many files and are NOT caused by this mission. The count increased from 758 (post-landing-polish) to 765 (post-project-setup) due to 7 new `@typescript-eslint/no-explicit-any` errors in new feature files, consistent with the established codebase pattern. Workers should compare their changes against this baseline — new lint errors in files they modified should be fixed, but the overall count will remain ~765.

## Document Parsing Libraries (Edge Functions)

- `unpdf` (via `npm:unpdf`) — PDF text extraction, zero-dep, edge/serverless optimized
- `mammoth` (via `npm:mammoth`) — DOCX text extraction
- These are imported in edge functions using Deno npm: specifiers, no install needed
