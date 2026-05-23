# Skill: generate-shot

Streams generation progress for a single shot.

**Endpoint**: `POST /functions/v1/gen-shots` (SSE)
**Auth**: required (Supabase JWT)
**Body**: `{ "shot_id": "uuid", "model_id": "gmi/ltx-fast-i2v" }`

Response is an `text/event-stream` of `{ type, progress, asset_url? }` events
ending with `type: "complete"` or `type: "error"`.

## Errors
- 402 — insufficient credits (payload `{ code, required, available, top_up_url }`)
- 422 — invalid shot/model combination
