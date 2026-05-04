import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { finalizeEditframeRender } from '../_shared/export-helpers.ts';
import { safeLog } from '../_shared/safe-logger.ts';
import { verifyEditframeWebhookSignature } from '../_shared/editframeWebhookSignature.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPORT_BUCKET = 'final-exports';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function webhookTopic(payload: Record<string, unknown>): string {
  return stringValue(payload.topic, payload.type, payload.event, payload.event_type) ?? 'unknown';
}

function webhookData(payload: Record<string, unknown>): Record<string, unknown> {
  return asRecord(payload.data ?? payload.render ?? payload.payload);
}

function webhookRenderId(payload: Record<string, unknown>): string | null {
  const data = webhookData(payload);
  return stringValue(
    data.id,
    data.render_id,
    data.renderId,
    payload.render_id,
    payload.renderId
  );
}

function webhookEventId(payload: Record<string, unknown>, topic: string, renderId: string | null): string | null {
  return stringValue(
    payload.id,
    payload.event_id,
    payload.eventId,
    renderId ? `${topic}:${renderId}:${String(payload.created_at ?? payload.timestamp ?? '')}` : null
  );
}

async function recordWebhookEvent(
  supabaseAdmin: any,
  payload: Record<string, unknown>,
  signature: string | null,
  topic: string,
  renderId: string | null,
  job: any | null,
  status = 'received',
  errorMessage?: string
) {
  const eventId = webhookEventId(payload, topic, renderId);
  const row = {
    event_id: eventId,
    render_id: renderId,
    project_id: job?.project_id ?? null,
    job_id: job?.id ?? null,
    user_id: job?.user_id ?? null,
    topic,
    status,
    signature,
    payload,
    error_message: errorMessage,
    processed_at: status === 'processed' || status === 'failed' || status === 'ignored'
      ? new Date().toISOString()
      : null,
  };

  if (eventId) {
    await supabaseAdmin
      .from('editframe_webhook_events')
      .upsert(row, { onConflict: 'event_id' });
    return;
  }

  await supabaseAdmin.from('editframe_webhook_events').insert(row);
}

async function findExportJob(supabaseAdmin: any, renderId: string | null) {
  if (!renderId) return null;
  const { data, error } = await supabaseAdmin
    .from('export_jobs')
    .select('*')
    .eq('provider_job_id', renderId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-webhook-signature');
  const secret = Deno.env.get('EDITFRAME_WEBHOOK_SECRET');
  const valid = await verifyEditframeWebhookSignature(rawBody, signature, secret);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid webhook payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const topic = webhookTopic(payload);
  const renderId = webhookRenderId(payload);
  const job = await findExportJob(supabaseAdmin, renderId);

  if (!job) {
    await recordWebhookEvent(supabaseAdmin, payload, signature, topic, renderId, null, 'ignored', 'Export job not found');
    safeLog('warn', 'editframe-webhook.job_not_found', { topic, renderId });
    return new Response(JSON.stringify({ ok: true, status: 'ignored' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (topic === 'render.completed') {
      const result = await finalizeEditframeRender(supabaseAdmin, job, EXPORT_BUCKET);
      await recordWebhookEvent(supabaseAdmin, payload, signature, topic, renderId, job, 'processed');
      return new Response(JSON.stringify({ ok: true, status: 'processed', outputUrl: result.publicUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (topic === 'render.failed') {
      const data = webhookData(payload);
      const errorMessage = stringValue(data.error, data.error_message, data.message, payload.error) ?? 'Editframe render failed';
      await supabaseAdmin
        .from('export_jobs')
        .update({
          status: 'failed',
          progress: 100,
          error_message: errorMessage,
          provider: 'editframe_remote',
          provider_status: 'failed',
          provider_payload: {
            ...(job.provider_payload ?? {}),
            stage: 'failed',
            editframeRenderId: renderId,
            webhookTopic: topic,
            webhookPayload: payload,
          },
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      await recordWebhookEvent(supabaseAdmin, payload, signature, topic, renderId, job, 'failed', errorMessage);
      return new Response(JSON.stringify({ ok: true, status: 'failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await recordWebhookEvent(supabaseAdmin, payload, signature, topic, renderId, job, 'received');
    return new Response(JSON.stringify({ ok: true, status: 'received' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    safeLog('error', 'editframe-webhook.processing_failed', { error, topic, renderId, jobId: job.id });
    await recordWebhookEvent(supabaseAdmin, payload, signature, topic, renderId, job, 'failed', message);
    await supabaseAdmin
      .from('export_jobs')
      .update({
        status: 'failed',
        error_message: message,
        provider_status: 'failed',
        provider_payload: {
          ...(job.provider_payload ?? {}),
          stage: 'failed',
          webhookError: message,
          webhookPayload: payload,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
