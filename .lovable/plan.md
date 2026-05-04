Do I know what the issue is? Yes.

The Voice failure is currently not reaching the Supabase Edge Function at all. The browser network trace shows this request:

```text
POST undefined/functions/v1/realtime-client-secret
Status: 200
Response Body: <!DOCTYPE html>...
```

Because `src/voice/realtime/realtimeClientSecret.ts` reads `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` directly, those values are becoming `undefined` in the preview bundle. The resulting URL is a relative path containing `undefined/functions/v1/...`, so the Vite/Lovable app serves `index.html` with HTTP 200. The voice code then calls `response.json()` on HTML, causing:

```text
Failed to execute 'json' on 'Response': Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Plan to resolve:

1. Fix Supabase config usage in the Voice client-secret fetcher
   - Update `src/voice/realtime/realtimeClientSecret.ts` to import the centralized `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `src/integrations/supabase/config.ts`.
   - This preserves the existing hardcoded public fallback values already used elsewhere in the app.
   - The request URL should become:

   ```text
   https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/realtime-client-secret
   ```

2. Harden JSON parsing so HTML/invalid responses do not crash Voice
   - Add a small response parser that checks `Content-Type` before calling `.json()`.
   - If the server returns HTML or plain text, throw a clear error such as:

   ```text
   Voice service returned a non-JSON response from <url>
   ```

   - This prevents the current unhandled promise rejection and keeps the UI in the controlled `Voice unavailable` state.

3. Improve error messages around Edge Function failures
   - Keep surfacing real JSON error payloads from the Edge Function.
   - Include status code and a concise message for non-OK responses.
   - Avoid exposing secrets or raw auth tokens.

4. Update/add tests for the regression
   - Adjust `src/voice/realtime/realtimeClientSecret.test.ts` to verify the fetch URL uses the centralized Supabase URL instead of `undefined`.
   - Add coverage for a `200 text/html` response so it throws a friendly controlled error rather than crashing on `response.json()`.
   - Keep existing tests for missing session, real Edge Function errors, and missing ephemeral key.

5. Re-test the Voice path after implementation
   - Confirm the browser network request goes to the Supabase function domain, not `undefined/functions/v1/...`.
   - Confirm the JSON parse runtime error disappears.
   - If a separate OpenAI `service_unavailable` appears after the URL fix, treat that as a downstream Realtime API availability/retry issue and handle it separately with better retry/backoff messaging.

I will implement this directly after approval.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>