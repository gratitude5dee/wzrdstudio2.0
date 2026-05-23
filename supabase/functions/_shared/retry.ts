/**
 * Fetch with exponential backoff retry for 429 (rate limit) responses.
 * 
 * - Retries up to `maxRetries` times on 429
 * - Respects `Retry-After` header if present
 * - Exponential backoff with jitter: 2^attempt * 1000 + random(0-1000)ms
 * - Non-retryable status codes pass through immediately
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status !== 429 || attempt === maxRetries) {
      return response;
    }

    // Calculate delay
    const retryAfter = response.headers.get('retry-after');
    let delayMs: number;

    if (retryAfter) {
      const seconds = Number(retryAfter);
      delayMs = Number.isFinite(seconds) ? seconds * 1000 : 2000;
    } else {
      // Exponential backoff with jitter
      delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
    }

    console.warn(
      `[fetchWithRetry] 429 rate limited (attempt ${attempt + 1}/${maxRetries}). Retrying in ${Math.round(delayMs)}ms...`
    );

    // Consume the body to free the connection
    await response.text().catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry: exhausted retries');
}
