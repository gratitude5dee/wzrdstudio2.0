import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export function extractRealtimeClientSecret(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  if (typeof record.value === 'string' && record.value.startsWith('ek_')) {
    return record.value;
  }

  const nested = record.client_secret;
  if (nested && typeof nested === 'object') {
    const value = (nested as Record<string, unknown>).value;
    if (typeof value === 'string' && value.startsWith('ek_')) {
      return value;
    }
  }

  return null;
}

/**
 * Fetches an ephemeral OpenAI Realtime client secret via the
 * `realtime-client-secret` Edge Function.
 *
 * Uses an explicit `fetch` instead of `supabase.functions.invoke` so we
 * control the Authorization header and can surface real error messages
 * instead of a generic "Failed to send a request to the Edge Function".
 */
export async function fetchRealtimeClientSecret(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error('Please sign in to use voice features.');
  }

  const url = `${SUPABASE_URL}/functions/v1/realtime-client-secret`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    let message = `Voice service error (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) {
        message = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      }
    } catch {
      // ignore parse failures
    }
    throw new Error(message);
  }

  const payload = await response.json();
  const secret = extractRealtimeClientSecret(payload);
  if (!secret) {
    throw new Error('Realtime client secret response did not include an ephemeral key.');
  }

  return secret;
}
