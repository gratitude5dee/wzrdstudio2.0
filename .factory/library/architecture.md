# Architecture

Architectural decisions, patterns, and conventions.

**What belongs here:** Codebase patterns, architectural decisions discovered during implementation, component structure notes.

---

## Zustand Store Pattern

The codebase uses Zustand v5 with devtools middleware. See `src/lib/stores/canvas-store.ts`:
- `create<StateType>()(devtools((set, get) => ({ ...initialState, ...actions })))`
- Named export: `useWorldviewStore`
- The canvas store also uses `persist` middleware, but the worldview store does NOT need persistence (in-memory only per the spec)
- Actions use `set((state) => ({ ... }))` updater pattern

## Service Pattern

Services are object literals exported as named constants. See `src/services/canvasService.ts`:
- `export const worldLabsService = { async method() { ... } }`
- Supabase client imported from `@/integrations/supabase/client`
- Edge functions called via `supabase.functions.invoke('function-name', { body: { ... } })`
- Auth check: `supabase.auth.getUser()` or `supabase.auth.getSession()`

## Edge Function Pattern

Edge functions in `supabase/functions/<name>/index.ts` using Deno:
- Import shared helpers: `authenticateRequest`, `corsHeaders`, `errorResponse`, `successResponse`, `handleCors`
- CORS preflight: `if (req.method === 'OPTIONS') return handleCors()`
- Auth: `await authenticateRequest(req.headers)` (validates JWT)
- Response helpers return proper status codes and CORS headers

## Component Pattern

- Components use Tailwind CSS with `cn()` for conditional classes
- shadcn/ui primitives from `@/components/ui/`
- Framer Motion for animations (`motion`, `AnimatePresence`)
- Toast via `sonner`: `toast.success()`, `toast.error()`
- Icons from `lucide-react`

## KanvasPage Studio Tab System

The KanvasPage uses a studio tab system:
- `KanvasStudio` type union in `src/features/kanvas/types.ts`
- `KANVAS_STUDIO_ORDER` array in `helpers.ts` — controls tab display order
- `KANVAS_STUDIO_META` record — label, headline, description per studio
- `STUDIO_ICONS` record in `KanvasPage.tsx` — maps studio to lucide icon
- `normalizeStudioParam()` — validates URL param, defaults to "image"
- URL-driven: `?studio=worldview` search param
- Tab renders in 3 places: header, left sidebar, mobile scroll area

## Unified Generation Service

The codebase has a unified generation service layer at `src/services/unifiedGenerationService.ts` (~1075 lines) that routes generation requests across 5 backends:
- **fal-stream**: fal.ai models (image, video) via Edge Function proxy
- **gemini-text**: Gemini text/storyline generation via Edge Function
- **groq-text**: Groq text generation via Edge Function
- **elevenlabs**: ElevenLabs audio generation via Edge Function
- **edge-function**: Direct Edge Function invocation

**Key types:** `GenerationInput`, `GenerationResult` (standard `{url, metadata, status}`)

**Convenience methods:** `generateImage()`, `generateVideo()`, `generateAudio()`, `generateText()`, `generate()`, `invokeEdgeFunction()`

**Model catalog:** `src/lib/studio-model-constants.ts` — all model IDs, credits, parameters. Credit helpers in `src/lib/constants/credits.ts`.

**Documentation:** See `SKILL.md` at repo root for full model catalog, input schemas, output formats, credit costs, and usage examples.

**Integration status:** Editor flows use the unified service. Studio and project-setup flows still use direct edge function calls and are candidates for incremental migration.

## Canvas Integration

To add images to the InfiniteCanvas:
- Import `useCanvasStore` from `@/lib/stores/canvas-store`
- Call `addObject()` with a full `CanvasObject`:
```ts
{
  id: crypto.randomUUID(),
  type: 'image',
  layerIndex: nextLayerIndex,
  transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
  visibility: true,
  locked: false,
  data: { src: imageUrl, width: 512, height: 288 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
```
