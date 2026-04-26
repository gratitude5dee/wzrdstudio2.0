export type BillingMode = 'disabled' | 'test_only' | 'live';

interface StripeSignatureParts {
  timestamp: string;
  signatures: string[];
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function getBillingMode(): BillingMode {
  const raw = (Deno.env.get('BILLING_MODE') || 'test_only').trim().toLowerCase();
  if (raw === 'disabled' || raw === 'live' || raw === 'test_only') {
    return raw;
  }
  return 'test_only';
}

export function isLiveStripeKey(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.startsWith('sk_live_');
}

export function isTestStripeKey(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.startsWith('sk_test_');
}

export function ensureStripeKeyAllowed(mode: BillingMode, key: string | null | undefined): { ok: boolean; message?: string } {
  if (!key) {
    return { ok: false, message: 'Stripe is not configured' };
  }

  if (mode === 'disabled') {
    return { ok: false, message: 'Checkout unavailable in disabled billing mode' };
  }

  if (mode === 'test_only') {
    if (isLiveStripeKey(key)) {
      return { ok: false, message: 'Live Stripe keys are not allowed in test_only mode' };
    }
    if (!isTestStripeKey(key)) {
      return { ok: false, message: 'A Stripe test secret key is required in test_only mode' };
    }
  }

  if (mode === 'live' && !isLiveStripeKey(key)) {
    return { ok: false, message: 'A Stripe live secret key is required in live mode' };
  }

  return { ok: true };
}

export function toStripeFormBody(input: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    params.append(key, String(value));
  }
  return params.toString();
}

export async function stripeRequest(
  key: string,
  method: 'POST' | 'GET',
  path: string,
  formData?: Record<string, string | number | boolean | null | undefined>
): Promise<any> {
  const url = `https://api.stripe.com/v1${path}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${key}`,
  };

  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = toStripeFormBody(formData || {});
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Stripe request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

export function parseStripeSignature(headerValue: string | null): StripeSignatureParts | null {
  if (!headerValue) return null;

  const parts = headerValue.split(',').map((p) => p.trim());
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of parts) {
    if (part.startsWith('t=')) {
      timestamp = part.slice(2);
    } else if (part.startsWith('v1=')) {
      signatures.push(part.slice(3));
    }
  }

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

export async function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  webhookSecret: string,
): Promise<boolean> {
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed) return false;

  const signedPayload = `${parsed.timestamp}.${payload}`;
  const keyBytes = new TextEncoder().encode(webhookSecret);
  const payloadBytes = new TextEncoder().encode(signedPayload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const digest = await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes);
  const expected = toHex(digest);

  return parsed.signatures.some((sig) => safeEqual(sig, expected));
}
