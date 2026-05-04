import { describe, expect, it, vi } from 'vitest';

import {
  extractRealtimeClientSecret,
  fetchRealtimeClientSecret,
} from './realtimeClientSecret';

describe('realtime client secret service', () => {
  it('extracts GA client secrets from current and nested response shapes', () => {
    expect(extractRealtimeClientSecret({ value: 'ek_direct' })).toBe('ek_direct');
    expect(extractRealtimeClientSecret({ client_secret: { value: 'ek_nested' } })).toBe('ek_nested');
  });

  it('fetches the Supabase realtime-client-secret function', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { value: 'ek_test' },
      error: null,
    });

    await expect(fetchRealtimeClientSecret(invoke)).resolves.toBe('ek_test');

    expect(invoke).toHaveBeenCalledWith('realtime-client-secret');
  });

  it('throws when Supabase returns an error or malformed payload', async () => {
    await expect(
      fetchRealtimeClientSecret(vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })),
    ).rejects.toThrow('denied');

    await expect(
      fetchRealtimeClientSecret(vi.fn().mockResolvedValue({ data: { nope: true }, error: null })),
    ).rejects.toThrow('Realtime client secret');
  });
});
