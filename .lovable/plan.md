## Plan to fix the generation failures

### Root cause
- Recent logs still show `generate-shot-image` submitting `model: "gpt-image-2"` to GMI.
- Your provided GMI docs show the valid serverless text-to-image identifier is `gpt-image-2-generate`.
- The current payload translator also restricts GPT Image 2 sizes to `1024x1024`, `1024x1536`, and `1536x1024`, while the GMI guide uses `1920x1080` and references 1080p / 2K / 4K pricing.

### Changes I’ll make
1. **Update the GMI model catalog**
   - Change the GPT Image 2 catalog entry endpoint from `gpt-image-2` to `gpt-image-2-generate`.
   - Add `gpt-image-2` as an alias only, so old saved project settings still resolve but new provider calls use the documented endpoint.
   - Update the raw API example to match the guide.

2. **Normalize model routing in `generate-shot-image`**
   - When a selected catalog model resolves to `gpt-image-2`, submit `gpt-image-2-generate` to GMI instead.
   - Keep the existing fallback ladder, but only after trying the corrected GPT Image 2 endpoint.

3. **Fix GPT Image 2 payload sizing**
   - Map project aspect ratios to GMI-compatible GPT Image 2 dimensions:
     - `16:9` → `1920x1080`
     - `9:16` → `1080x1920`
     - `1:1` → `1024x1024`
     - `4:3` → `2048x1536`
     - `3:4` → `1536x2048`
   - Allow those sizes in the GPT Image 2 payload translator instead of forcing unsupported fallbacks.

4. **Improve retry behavior**
   - Treat temporary GMI backend errors and request timeouts as retryable for fallback models.
   - Avoid returning generic 500s for provider-routing failures when a fallback model can still run.

5. **Validate after implementation**
   - Deploy `generate-shot-image`.
   - Check logs to confirm requests now use `model=gpt-image-2-generate`.
   - If possible, test the function against an existing shot and confirm it reaches queued/polling instead of failing at submission.