import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

import {
  extractRealtimeClientSecret,
  fetchRealtimeClientSecret,
} from './realtimeClientSecret';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

import { supabase } from '@/integrations/supabase/client';

describe('realtime client secret service', () => {
  it('extracts GA client secrets from current and nested response shapes', () => {
    expect(extractRealtimeClientSecret({ value: 'ek_direct' })).toBe('ek_direct');
    expect(extractRealtimeClientSecret({ client_secret: { value: 'ek_nested' } })).toBe('ek_nested');
  });

  describe('fetchRealtimeClientSecret', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('throws when no session is available', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: null },
      });

      await expect(fetchRealtimeClientSecret()).rejects.toThrow('Please sign in');
    });

    it('calls the edge function with correct headers and returns the secret', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ value: 'ek_test123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const secret = await fetchRealtimeClientSecret();
      expect(secret).toBe('ek_test123');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('realtime-client-secret');
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer test-token',
      });
    });

    it('surfaces the real error message from a failed response', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(fetchRealtimeClientSecret()).rejects.toThrow('OPENAI_API_KEY is not configured');
    });

    it('throws when the response lacks an ephemeral key', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ nope: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(fetchRealtimeClientSecret()).rejects.toThrow('ephemeral key');
    });
  });
});
