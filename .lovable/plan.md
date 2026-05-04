Plan to fix the persistent voice error:

1. Replace the voice client-secret call with an explicit authenticated fetch
   - Update `src/voice/realtime/realtimeClientSecret.ts` so it no longer relies on `supabase.functions.invoke('realtime-client-secret')` for this path.
   - Read the active Supabase session with `supabase.auth.getSession()`.
   - If no access token exists, throw a clear `Please sign in again to use voice.` message instead of the generic Supabase `Failed to send a request to the Edge Function`.
   - Call `https://<supabase-project>.supabase.co/functions/v1/realtime-client-secret` directly with:
     - `Authorization: Bearer <access_token>`
     - `apikey: <publishable key>`
     - `Content-Type: application/json`
   - Parse the error body on non-2xx responses so the UI shows the real cause, e.g. missing auth, OpenAI model access, or invalid OpenAI key.

2. Harden Edge Function CORS for current Supabase JS/browser headers
   - Update the shared CORS allow-list in `supabase/functions/_shared/response.ts` to include the additional Supabase client headers used by newer SDKs:
     - `x-supabase-client-platform`
     - `x-supabase-client-platform-version`
     - `x-supabase-client-runtime`
     - `x-supabase-client-runtime-version`
   - This prevents browser preflight failures from surfacing as `FunctionsFetchError`.

3. Improve the voice hook’s error reporting
   - In `useWzrdRealtimeSession`, preserve the detailed error from `fetchRealtimeClientSecret()`.
   - Avoid replacing it with the generic `Voice connection failed` fallback unless the thrown value is truly unknown.

4. Update tests for the new explicit fetch behavior
   - Adjust `realtimeClientSecret.test.ts` so it verifies:
     - no session produces the clear sign-in message
     - fetch is called with `Authorization`, `apikey`, and JSON headers
     - HTTP error responses surface their real message
     - valid `ek_...` responses still extract correctly

5. Deploy and verify the Edge Function
   - Deploy `realtime-client-secret` after the CORS/shared response update.
   - Test the deployed function directly.
   - If the authenticated call reaches OpenAI but fails, the remaining issue will be upstream OpenAI access/configuration rather than the app’s request path.

Notes:
- I do not expect any new API keys to be required; `OPENAI_API_KEY` is already configured.
- The current error text is the Supabase client’s network/preflight error, not the actual Edge Function response. The fix above should either make voice connect or reveal the true backend/OpenAI error in the UI.
- I also noticed the preview is reporting unrelated TypeScript build errors. If those continue blocking deployment after this voice patch, I’ll keep the voice fix focused and only make the smallest necessary compile fixes related to the files touched by this change.