export interface AdaptiveConcurrencyProgress {
  total: number;
  completed: number;
  active: number;
  queued: number;
  failed: number;
  concurrency: number;
}

export interface AdaptiveTaskError {
  itemIndex: number;
  attempts: number;
  error: unknown;
}

export interface AdaptiveTaskResult<T> {
  success: boolean;
  value?: T;
  error?: unknown;
  attempts: number;
}

interface ProcessWithAdaptiveConcurrencyOptions<TItem, TResult> {
  items: TItem[];
  initialConcurrency: number;
  minConcurrency?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  jitterMs?: number;
  isCancelled?: () => boolean;
  shouldRetry?: (error: unknown) => boolean;
  onRateLimit?: (error: unknown) => void;
  onProgress?: (progress: AdaptiveConcurrencyProgress) => void;
  processor: (item: TItem, index: number, attempt: number) => Promise<TResult>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isRateLimitError = (error: unknown): boolean => {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error);

  const lowered = message.toLowerCase();
  return (
    lowered.includes('429') ||
    lowered.includes('rate limit') ||
    lowered.includes('too many requests')
  );
};

const defaultShouldRetry = (error: unknown) => isRateLimitError(error);

const getBackoffDelay = (
  attempt: number,
  baseDelayMs: number,
  jitterMs: number
) => {
  const exp = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * (jitterMs + 1));
  return exp + jitter;
};

export async function processWithAdaptiveConcurrency<TItem, TResult>({
  items,
  initialConcurrency,
  minConcurrency = 1,
  maxRetries = 2,
  baseDelayMs = 400,
  jitterMs = 350,
  isCancelled,
  shouldRetry = defaultShouldRetry,
  onRateLimit,
  onProgress,
  processor,
}: ProcessWithAdaptiveConcurrencyOptions<TItem, TResult>): Promise<{
  results: AdaptiveTaskResult<TResult>[];
  errors: AdaptiveTaskError[];
}> {
  const total = items.length;
  const results: AdaptiveTaskResult<TResult>[] = new Array(total);
  const errors: AdaptiveTaskError[] = [];

  if (total === 0) {
    onProgress?.({
      total,
      completed: 0,
      active: 0,
      queued: 0,
      failed: 0,
      concurrency: Math.max(minConcurrency, initialConcurrency),
    });
    return { results: [], errors };
  }

  let currentConcurrency = Math.max(minConcurrency, initialConcurrency);
  let nextIndex = 0;
  let active = 0;
  let completed = 0;
  let failed = 0;

  const reportProgress = () => {
    onProgress?.({
      total,
      completed,
      active,
      queued: Math.max(total - completed - active, 0),
      failed,
      concurrency: currentConcurrency,
    });
  };

  const runOne = async (item: TItem, index: number) => {
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (isCancelled?.()) {
        throw new Error('Cancelled');
      }

      try {
        const value = await processor(item, index, attempt);
        results[index] = { success: true, value, attempts: attempt + 1 };
        return;
      } catch (error) {
        attempt += 1;
        const canRetry = attempt <= maxRetries && shouldRetry(error);

        if (isRateLimitError(error)) {
          currentConcurrency = Math.max(minConcurrency, currentConcurrency - 1);
          onRateLimit?.(error);
        }

        if (!canRetry) {
          results[index] = { success: false, error, attempts: attempt };
          errors.push({ itemIndex: index, attempts: attempt, error });
          failed += 1;
          return;
        }

        const delay = getBackoffDelay(attempt, baseDelayMs, jitterMs);
        await sleep(delay);
      }
    }
  };

  await new Promise<void>((resolve) => {
    const schedule = () => {
      if (isCancelled?.() && active === 0) {
        resolve();
        return;
      }

      while (
        !isCancelled?.() &&
        active < currentConcurrency &&
        nextIndex < total
      ) {
        const index = nextIndex;
        const item = items[index];
        nextIndex += 1;
        active += 1;
        reportProgress();

        runOne(item, index)
          .catch((error) => {
            if (!(error instanceof Error && error.message === 'Cancelled')) {
              failed += 1;
              results[index] = {
                success: false,
                error,
                attempts: maxRetries + 1,
              };
              errors.push({
                itemIndex: index,
                attempts: maxRetries + 1,
                error,
              });
            }
          })
          .finally(() => {
            active -= 1;
            completed += 1;
            reportProgress();

            if (
              (nextIndex >= total || isCancelled?.()) &&
              active === 0
            ) {
              resolve();
              return;
            }

            schedule();
          });
      }
    };

    reportProgress();
    schedule();
  });

  return { results, errors };
}

