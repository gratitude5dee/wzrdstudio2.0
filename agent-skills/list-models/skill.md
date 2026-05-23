# Skill: list-models

Returns the catalog of generation models with credit cost per call.

**Endpoint**: `GET https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/model-catalog`
**Auth**: optional (bearer Supabase JWT for user-tier sorting)

## Response
```json
{ "models": [{ "id": "gmi/seedream-5.0-lite", "name": "Seedream 5 Lite", "credits": 2, "media_type": "image", "provider": "gmi-cloud" }] }
```

## Errors
- 500 — catalog refresh failed; retry
