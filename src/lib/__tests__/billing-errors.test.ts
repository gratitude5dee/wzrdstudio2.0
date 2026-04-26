import { describe, expect, it, vi } from 'vitest';
import {
  extractInsufficientCreditsError,
  extractInsufficientCreditsFromResponse,
  routeToBillingTopUp,
} from '@/lib/billing-errors';

describe('billing-errors', () => {
  it('extracts insufficient-credit payload from a 402 response', async () => {
    const response = new Response(
      JSON.stringify({
        code: 'insufficient_credits',
        required: 6,
        available: 2,
        top_up_url: '/settings/billing',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );

    const payload = await extractInsufficientCreditsFromResponse(response);
    expect(payload).toMatchObject({
      code: 'insufficient_credits',
      required: 6,
      available: 2,
      top_up_url: '/settings/billing',
    });
  });

  it('extracts insufficient-credit payload from function error context', async () => {
    const error = {
      context: new Response(
        JSON.stringify({
          code: 'insufficient_credits',
          required: 3,
          available: 0,
          top_up_url: '/settings/billing',
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      ),
    };

    const payload = await extractInsufficientCreditsError(error);
    expect(payload?.required).toBe(3);
    expect(payload?.available).toBe(0);
  });

  it('dispatches modal-open event when already on billing route', () => {
    window.history.pushState({}, '', '/settings/billing');
    const listener = vi.fn();
    window.addEventListener('billing:open-topup', listener);

    routeToBillingTopUp({ required: 4, available: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('billing:open-topup', listener);
  });
});
