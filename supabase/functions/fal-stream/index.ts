import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  executeFalModel,
  pollFalStatus,
  inferFalMediaType,
  getDefaultFalModelForMedia,
  mergeFalModelInputs,
  normalizeFalModelId,
  resolveFalModelOrFallback,
  type FalMediaType,
} from '../_shared/falai-client.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getCreditCostForModel,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
  shouldSkipCreditBilling,
} from '../_shared/credits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-credit-billing',
};

const MAX_POLL_ATTEMPTS = 300;
const POLL_INTERVAL_MS = 1000;

function toProgress(status: string, queuePosition?: number): number {
  if (status === 'COMPLETED') return 100;
  if (status === 'FAILED') return 100;
  if (status === 'IN_QUEUE') {
    if (typeof queuePosition === 'number') {
      return Math.max(5, Math.min(35, 35 - queuePosition));
    }
    return 10;
  }
  if (status === 'IN_PROGRESS') {
    return 70;
  }
  return 25;
}

function sendSse(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: Record<string, unknown>
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

async function fetchFalResponseUrl(responseUrl: string, falKey: string): Promise<any> {
  const resp = await fetch(responseUrl, {
    method: 'GET',
    headers: { Authorization: `Key ${falKey}` },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch final Fal result (${resp.status})`);
  }
  return await resp.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const modelId = String(body?.modelId || '').trim();
    const rawInputs = (body?.inputs && typeof body.inputs === 'object') ? body.inputs : {};

    if (!modelId) {
      return new Response(
        JSON.stringify({ error: 'modelId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const falKey = Deno.env.get('FAL_KEY');
    if (!falKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: API key missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let hintedMediaType: FalMediaType;
    const mediaHint = typeof body?.media_type === 'string' ? body.media_type : '';
    if (mediaHint === 'image' || mediaHint === 'video' || mediaHint === 'audio' || mediaHint === 'json' || mediaHint === 'utility') {
      hintedMediaType = mediaHint;
    } else {
      hintedMediaType = inferFalMediaType(modelId);
    }

    const resolution = resolveFalModelOrFallback(modelId, {
      mediaTypeHint: hintedMediaType,
      uiGroup: 'generation',
    });

    const resolvedFromRequest = mergeFalModelInputs(resolution.model.id, rawInputs);
    const normalizedRequestedModel = normalizeFalModelId(modelId);
    const fallbackModel = getDefaultFalModelForMedia(hintedMediaType, 'generation');
    const fallbackCandidateId = fallbackModel.id;
    const requestId = typeof body?.request_id === 'string' ? body.request_id : crypto.randomUUID();
    const resourceTypeForBilling =
      hintedMediaType === 'video' ? 'video'
      : hintedMediaType === 'audio' ? 'audio'
      : hintedMediaType === 'image' ? 'image'
      : 'generation';
    const primaryCost = getCreditCostForModel(resolvedFromRequest.modelId, resourceTypeForBilling);
    const fallbackCost = getCreditCostForModel(fallbackCandidateId, resourceTypeForBilling);
    const reservedAmount = Math.max(primaryCost, fallbackCost);
    const creditReservation = await reserveCredits({
      supabase: supabaseClient,
      userId: claimsData.user.id,
      resourceType: resourceTypeForBilling,
      requestedAmount: reservedAmount,
      referenceType: 'fal_stream',
      referenceId: String(body?.project_id || body?.scene_id || body?.node_id || modelId),
      idempotencyKey: buildCreditIdempotencyKey(
        'fal-stream',
        claimsData.user.id,
        requestId,
        modelId
      ),
      metadata: {
        endpoint: 'fal-stream',
        requested_model: modelId,
        resolved_model: resolvedFromRequest.modelId,
      },
      skipBilling: shouldSkipCreditBilling(req.headers),
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const runForModel = async (
          attemptModelId: string,
          metadata: { fallbackUsed: boolean; fallbackReason?: string }
        ): Promise<string> => {
          const merged = mergeFalModelInputs(attemptModelId, rawInputs);

          sendSse(controller, encoder, {
            type: 'meta',
            requested_model: modelId,
            normalized_requested_model: normalizedRequestedModel,
            resolved_model: merged.modelId,
            media_type: hintedMediaType,
            fallback_used: metadata.fallbackUsed,
            fallback_reason: metadata.fallbackReason,
          });

          const submit = await executeFalModel(merged.modelId, merged.inputs, 'queue');
          if (!submit.success) {
            throw new Error(submit.error || `Failed to submit ${merged.modelId}`);
          }

          if (!submit.requestId) {
            sendSse(controller, encoder, {
              type: 'done',
              result: submit.data,
              model: merged.modelId,
              fallback_used: metadata.fallbackUsed,
              fallback_reason: metadata.fallbackReason,
            });
            return merged.modelId;
          }

          for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

            const status = await pollFalStatus(submit.requestId, submit.statusUrl);
            if (!status.success) {
              if (attempt >= 5) {
                throw new Error(status.error || 'Failed while polling Fal status');
              }
              continue;
            }

            const statusData = status.data || {};
            const falStatus = statusData.status || 'IN_PROGRESS';
            const queuePosition = statusData.queue_position;
            const logs = Array.isArray(statusData.logs) ? statusData.logs : [];

            sendSse(controller, encoder, {
              type: 'progress',
              event: {
                status: falStatus,
                progress: toProgress(falStatus, queuePosition),
                queue_position: queuePosition,
                logs,
              },
              model: merged.modelId,
              fallback_used: metadata.fallbackUsed,
            });

            if (falStatus === 'COMPLETED') {
              let result: any = statusData.result;
              if (submit.responseUrl) {
                try {
                  result = await fetchFalResponseUrl(submit.responseUrl, falKey);
                } catch (fetchError) {
                  if (!result) {
                    throw fetchError;
                  }
                }
              }

              sendSse(controller, encoder, {
                type: 'done',
                result,
                model: merged.modelId,
                fallback_used: metadata.fallbackUsed,
                fallback_reason: metadata.fallbackReason,
              });
              return merged.modelId;
            }

            if (falStatus === 'FAILED') {
              throw new Error(`Fal job failed for ${merged.modelId}`);
            }
          }

          throw new Error(`Timed out waiting for Fal response from ${merged.modelId}`);
        };

        try {
          const succeededModel = await runForModel(resolvedFromRequest.modelId, {
            fallbackUsed: resolution.fallbackUsed,
            fallbackReason: resolution.fallbackReason,
          });
          await commitCredits({
            supabase: supabaseClient,
            holdId: creditReservation.holdId,
            skipped: creditReservation.skipped,
            amount: getCreditCostForModel(succeededModel, resourceTypeForBilling),
            userId: claimsData.user.id,
            metadata: {
              endpoint: 'fal-stream',
              model: succeededModel,
              request_id: requestId,
            },
          });
        } catch (primaryError) {
          const primaryMessage = primaryError instanceof Error ? primaryError.message : 'Fal execution failed';

          const shouldTryFallback = resolvedFromRequest.modelId !== fallbackCandidateId;
          if (shouldTryFallback) {
            try {
              sendSse(controller, encoder, {
                type: 'fallback',
                message: `Primary model failed, retrying with ${fallbackCandidateId}`,
                original_model: resolvedFromRequest.modelId,
                fallback_model: fallbackCandidateId,
                reason: primaryMessage,
              });

              const fallbackSucceededModel = await runForModel(fallbackCandidateId, {
                fallbackUsed: true,
                fallbackReason: `runtime_failure:${resolvedFromRequest.modelId}`,
              });
              await commitCredits({
                supabase: supabaseClient,
                holdId: creditReservation.holdId,
                skipped: creditReservation.skipped,
                amount: getCreditCostForModel(fallbackSucceededModel, resourceTypeForBilling),
                userId: claimsData.user.id,
                metadata: {
                  endpoint: 'fal-stream',
                  model: fallbackSucceededModel,
                  request_id: requestId,
                  fallback_from: resolvedFromRequest.modelId,
                },
              });
              controller.close();
              return;
            } catch (fallbackError) {
              const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Fallback failed';
              await releaseCredits({
                supabase: supabaseClient,
                holdId: creditReservation.holdId,
                skipped: creditReservation.skipped,
                userId: claimsData.user.id,
                reason: 'fallback_failed',
                metadata: {
                  endpoint: 'fal-stream',
                  request_id: requestId,
                  primary_error: primaryMessage,
                  fallback_error: fallbackMessage,
                },
              });
              sendSse(controller, encoder, {
                type: 'error',
                error: fallbackMessage,
                reason: 'fallback_failed',
                original_error: primaryMessage,
              });
              controller.close();
              return;
            }
          }

          await releaseCredits({
            supabase: supabaseClient,
            holdId: creditReservation.holdId,
            skipped: creditReservation.skipped,
            userId: claimsData.user.id,
            reason: 'primary_failed_no_fallback',
            metadata: {
              endpoint: 'fal-stream',
              request_id: requestId,
              primary_error: primaryMessage,
            },
          });
          sendSse(controller, encoder, {
            type: 'error',
            error: primaryMessage,
            reason: 'primary_failed_no_fallback',
          });
          controller.close();
          return;
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }
    console.error('fal-stream request processing error:', error?.message, error?.stack);
    return new Response(
      JSON.stringify({ error: 'Request failed. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
