import { supabase } from '@/integrations/supabase/client';

type SupabaseInvoke = typeof supabase.functions.invoke;

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

export async function fetchRealtimeClientSecret(
  invoke: SupabaseInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<string> {
  const { data, error } = await invoke('realtime-client-secret');

  if (error) {
    throw new Error(error.message || 'Failed to create Realtime client secret.');
  }

  const secret = extractRealtimeClientSecret(data);
  if (!secret) {
    throw new Error('Realtime client secret response did not include an ephemeral key.');
  }

  return secret;
}
