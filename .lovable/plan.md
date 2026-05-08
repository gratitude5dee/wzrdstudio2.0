
# Fix: GMI Narrative Generation Authentication Failed

## Problem

The `generate-storylines` edge function calls `executeGmiChatCompletion` with model `google/gemini-3.1-flash-lite-preview` against the GMI LLM endpoint (`https://api.gmi-serving.com/v1/chat/completions`). The API returns "Authentication failed", meaning the `GMI_CLOUD_API_KEY` stored in Supabase secrets is either:

1. **Expired or revoked** — needs to be re-generated from the GMI Cloud console
2. **Wrong key for the LLM endpoint** — the key may only work for the queue API (`console.gmicloud.ai`), not the serving API (`api.gmi-serving.com`)
3. **Invalid format** — some providers require specific key prefixes

## Fix Steps

### Step 1: Verify/update the GMI_CLOUD_API_KEY secret

You need to go to your [GMI Cloud console](https://console.gmicloud.ai) and:
1. Confirm your API key is still active
2. Confirm it has access to the LLM chat completions endpoint (`api.gmi-serving.com/v1`)
3. If expired, generate a new one

Then I'll update the secret in Supabase with the new key.

### Step 2: Add better error logging (code change)

Add the HTTP status code and a key prefix hint to the error message in `gmi-client.ts` so future auth issues are easier to diagnose:

```diff
// In executeGmiChatCompletion, line ~380
- errorMessage = error.message || error.error || `GMI LLM request failed (${response.status})`;
+ errorMessage = error.message || error.error || `GMI LLM request failed (${response.status}): ${responseText.slice(0, 200)}`;
```

Also add a startup validation log:
```typescript
// In getGmiApiKey()
const key = Deno.env.get('GMI_CLOUD_API_KEY');
if (!key) throw new Error('GMI_CLOUD_API_KEY environment variable is not set');
console.log(`[GMI] Using API key: ${key.slice(0, 6)}...${key.slice(-4)} (${key.length} chars)`);
return key;
```

### Step 3: Add Groq fallback (optional resilience)

Since `GROQ_API_KEY` is already set, we could add a fallback in `generate-storylines` so if GMI auth fails, it falls back to Groq's `llama-3.3-70b-versatile` for narrative generation. This matches the existing pattern (the code already references "true Groq streaming" as Phase 2).

## Technical Details

- **File:** `supabase/functions/_shared/gmi-client.ts` — improved error logging in `getGmiApiKey()` and `executeGmiChatCompletion()`
- **File:** `supabase/functions/generate-storylines/index.ts` — optional Groq fallback
- **Secret:** `GMI_CLOUD_API_KEY` — may need updating via Supabase secrets

## Priority

Step 1 (re-validating the key) is the critical fix. Steps 2-3 are improvements to prevent silent failures.
