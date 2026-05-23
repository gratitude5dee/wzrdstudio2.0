import { describe, expect, it, vi } from 'vitest';

import {
  getCreditCostForModel,
  InsufficientCreditsError,
  reserveCredits,
  shouldSkipCreditBilling,
} from '../../../supabase/functions/_shared/credits.ts';

describe('edge credits shared helper', () => {
  it('never lets request headers bypass billing', () => {
    const headers = new Headers({ 'x-credit-billing': 'upstream' });
    expect(shouldSkipCreditBilling(headers)).toBe(false);
  });

  it('charges at least one credit for GMI models', () => {
    expect(getCreditCostForModel('gmi/unknown-free-model', 'text')).toBeGreaterThanOrEqual(1);
  });

  it('reserves through the ledger RPC instead of legacy deduct_credits', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        hold_id: 'hold-1',
        available_after: 95,
      },
      error: null,
    });

    const result = await reserveCredits({
      supabase: { rpc },
      userId: 'user-1',
      resourceType: 'image',
      requestedAmount: 5,
      referenceType: 'test',
      referenceId: 'ref-1',
      idempotencyKey: 'key-1',
      metadata: { source: 'test' },
    });

    expect(rpc).toHaveBeenCalledWith('credits_reserve', expect.objectContaining({
      resource_type: 'image',
      requested_amount: 5,
      idempotency_key: 'key-1',
    }));
    expect(rpc).not.toHaveBeenCalledWith('deduct_credits', expect.anything());
    expect(result.holdId).toBe('hold-1');
    expect(result.availableAfter).toBe(95);
  });

  it('turns insufficient reserve responses into 402-compatible errors', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: false,
        code: 'insufficient_credits',
        required: 20,
        available: 0,
        top_up_url: '/settings/billing',
        upgrade_url: '/settings/billing#plans',
      },
      error: null,
    });

    await expect(reserveCredits({
      supabase: { rpc },
      userId: 'user-1',
      resourceType: 'video',
      requestedAmount: 20,
      referenceType: 'test',
      referenceId: 'ref-1',
      idempotencyKey: 'key-1',
      metadata: {},
    })).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});
