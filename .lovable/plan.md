## Diagnosis

The current failure is not a generic Edge Function issue. The logs show the exact provider rejection:

```text
400: gpt-image-2: size dimensions must be multiples of 16 (got 1920x1080)
```

`1920` is valid, but `1080` is not divisible by 16. The `generate-shot-image` function maps a 16:9 project to `1920x1080`, then sends that to GMI as `gpt-image-2-generate`, so GMI rejects the request before generation starts.

## Fix plan

1. **Correct GPT Image 2 size mapping**
   - Update `supabase/functions/generate-shot-image/index.ts` so `getGptImageSizeForAspectRatio()` returns valid multiples-of-16 dimensions.
   - Use reliable, documented sizes:
     - `16:9` → `2048x1152`
     - `9:16` → `1152x2048`
     - `1:1` → `1024x1024`
     - `4:3` → `1536x1152`
     - `3:4` → `1152x1536`
   - These preserve aspect ratios and satisfy GPT Image 2 constraints.

2. **Harden shared GMI payload normalization**
   - Update `supabase/functions/_shared/gmi-types.ts` so GPT Image 2 no longer treats invalid sizes like `1920x1080` as valid.
   - Replace the static allow-list with a validator that checks:
     - both dimensions are multiples of 16,
     - max edge is within limit,
     - total pixels are within GPT Image 2 limits,
     - long:short ratio is not over `3:1`.
   - This prevents future catalog/default/client values from reintroducing the same provider-side 400.

3. **Improve fallback behavior for provider validation errors**
   - Add this specific `multiples of 16` provider error to the retryable/fallback classifier in `generate-shot-image`.
   - That way, if a future GMI model rejects dimensions, the function can try the next configured image model instead of immediately returning 500.

4. **Make the frontend error useful instead of opaque**
   - Update the image-generation hook/page call site so when the Edge Function returns JSON with an error, the thrown error includes that message rather than only `Edge Function returned a non-2xx status code`.
   - This keeps future provider errors visible in the UI/logs.

5. **Validate**
   - Run a targeted search to confirm no remaining GPT Image 2 path sends `1920x1080` / `1080x1920`.
   - Deploy the updated Edge Function.
   - Check recent Edge Function logs after deploy for the corrected request body containing `2048x1152` for `16:9` shots.