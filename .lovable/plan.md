# Fix: GMI Authentication Failed (Placeholder API Key)

## Root Cause

Edge function logs reveal:
```
[GMI] Using API key: PLACEH...ACED (32 chars)
[GMI] LLM HTTP 401 for model google/gemini-3.1-flash-lite-preview: Authentication failed
```

The `GMI_CLOUD_API_KEY` secret in Supabase is set to the literal placeholder string `PLACEHOLDER_REPLACE` (32 chars) — not a real key. Every GMI call therefore 401s, and `generate-concept-examples` returns 500 to the client (it has no fallback).

The Groq fallback we added previously only covers `generate-storylines`, so the rest of the GMI-dependent edge functions still hard-fail.

## Plan

### Step 1 — Replace the placeholder GMI_CLOUD_API_KEY (required, user action)

1. Go to https://console.gmicloud.ai → API Keys → create or copy a valid key with access to the LLM endpoint (`api.gmi-serving.com/v1`).
2. Update the Supabase secret `GMI_CLOUD_API_KEY` with that real value.

I will trigger the secret update prompt for you once you confirm.

### Step 2 — Add Groq fallback to `generate-concept-examples`

Mirror the pattern already used in `generate-storylines`:
- Wrap the GMI call in a try/catch.
- On auth-style errors (401/403/"authentication"/"unauthorized"), fall back to Groq `llama-3.3-70b-versatile` via OpenAI-compatible `chat/completions`.
- Keep the same JSON-only system prompt so parsing is unchanged.

This makes the concept-examples flow resilient even if the GMI key lapses again.

### Step 3 — (Optional, recommended) Audit other GMI-only callers

Quick grep for `executeGmiChatCompletion` to identify any other LLM edge functions that would 500 under the same condition (e.g. character generation, prompt rewriters). For each:
- If user-blocking → add the same Groq fallback.
- If background → leave as-is but ensure the error surfaces gracefully.

I'll list the affected functions after the grep and confirm with you before adding fallbacks broadly.

## Files to change

- `supabase/functions/generate-concept-examples/index.ts` — add `callGroqFallback()` and try/catch wrapper.
- (Optional, Step 3) other `*/index.ts` functions calling `executeGmiChatCompletion` for LLM tasks.

## Verification

1. After you update `GMI_CLOUD_API_KEY`, re-trigger "Generate concept examples" on `/project-setup` — should return 200 with concepts.
2. Check edge logs: `[GMI] Using API key: <real-prefix>...` and no 401.
3. To validate the fallback path, temporarily revoke the key (or trust the existing storyline fallback logs) — concept examples should still return 200 via Groq.

## Note on Overshoot

Overshoot is unrelated to this error — it's the observability layer. No action needed there for this fix.
