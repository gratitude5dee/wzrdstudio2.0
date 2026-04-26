/**
 * Hash an API key using SHA-256 and return hex string.
 * Used for secure API key storage and lookup.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Look up an agent by hashed API key.
 */
export async function getAgentByApiKey(supabase: any, apiKey: string) {
  const hash = await hashApiKey(apiKey);
  const { data, error } = await supabase
    .from('mog_agent_profiles')
    .select('*')
    .eq('api_key_hash', hash)
    .single();
  
  if (error || !data) return null;
  return data;
}
