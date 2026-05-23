import { describe, expect, it, vi } from 'vitest';
import { processWithAdaptiveConcurrency } from '@/utils/processWithAdaptiveConcurrency';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('processWithAdaptiveConcurrency', () => {
  it('respects max active workers for the configured concurrency', async () => {
    let active = 0;
    let maxActive = 0;

    const { results, errors } = await processWithAdaptiveConcurrency({
      items: Array.from({ length: 8 }, (_, index) => index),
      initialConcurrency: 3,
      maxRetries: 0,
      processor: async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await wait(10);
        active -= 1;
        return item;
      },
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(errors).toHaveLength(0);
    expect(results.filter((result) => result?.success)).toHaveLength(8);
  });

  it('retries throttled work and lowers concurrency after rate limits', async () => {
    const attempts = new Map<number, number>();
    const onRateLimit = vi.fn();
    const concurrencySnapshots: number[] = [];

    const { results } = await processWithAdaptiveConcurrency({
      items: [0, 1, 2],
      initialConcurrency: 3,
      maxRetries: 2,
      baseDelayMs: 1,
      jitterMs: 0,
      onRateLimit,
      onProgress: ({ concurrency }) => {
        concurrencySnapshots.push(concurrency);
      },
      processor: async (item) => {
        const attempt = attempts.get(item) ?? 0;
        attempts.set(item, attempt + 1);
        if (item === 0 && attempt < 1) {
          throw new Error('429 Too Many Requests');
        }
        return item;
      },
    });

    expect(attempts.get(0)).toBe(2);
    expect(onRateLimit).toHaveBeenCalledTimes(1);
    expect(Math.min(...concurrencySnapshots)).toBeLessThan(3);
    expect(results.every((result) => result?.success)).toBe(true);
  });

  it('stops queueing new work after cancellation', async () => {
    let cancelled = false;
    let started = 0;

    const { results } = await processWithAdaptiveConcurrency({
      items: Array.from({ length: 10 }, (_, index) => index),
      initialConcurrency: 2,
      maxRetries: 0,
      isCancelled: () => cancelled,
      processor: async (item) => {
        started += 1;
        if (item === 0) {
          cancelled = true;
        }
        await wait(10);
        return item;
      },
    });

    expect(started).toBeLessThan(10);
    expect(results.filter(Boolean).length).toBeLessThan(10);
  });
});
