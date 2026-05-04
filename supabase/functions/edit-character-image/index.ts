import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as fal from "npm:@fal-ai/serverless-client";
import { resolveImageGenerationPlan } from "../_shared/image-fallback.ts";
import { executeGmiQueueModel, pollGmiQueueStatus } from "../_shared/gmi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NANO_BANANA_FAST_EDIT_ALIAS = 'nano_banana_fast_edit';
const DEFAULT_NANO_BANANA_FAST_EDIT_MODEL = 'fal-ai/nano-banana-2/edit';

function resolveModelAlias(modelAlias?: string | null, preferredModel?: string | null) {
  if (preferredModel && preferredModel !== NANO_BANANA_FAST_EDIT_ALIAS) {
    return preferredModel;
  }
  if (!modelAlias || modelAlias === NANO_BANANA_FAST_EDIT_ALIAS) {
    return Deno.env.get('NANO_BANANA_FAST_EDIT_MODEL') || DEFAULT_NANO_BANANA_FAST_EDIT_MODEL;
  }
  return modelAlias;
}

function asStructuredPrompt(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

fal.config({
  credentials: Deno.env.get('FAL_KEY'),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      character_id,
      source_image_url,
      edit_prompt,
      style_reference_url,
      preferred_model,
      model_alias,
      structured_prompt,
    } = await req.json();

    const structuredPrompt = asStructuredPrompt(structured_prompt);
    const promptText =
      typeof structuredPrompt?.edit_prompt === 'string'
        ? structuredPrompt.edit_prompt
        : edit_prompt;
    const preserve = asStringArray(structuredPrompt?.preserve);
    const avoid = asStringArray(structuredPrompt?.avoid);
    const aspectRatio =
      typeof structuredPrompt?.aspect_ratio === 'string'
        ? structuredPrompt.aspect_ratio
        : 'auto';
    const requestedModel = resolveModelAlias(model_alias, preferred_model);
    const providerPrompt = [
      promptText,
      preserve.length ? `Preserve: ${preserve.join(', ')}` : null,
      avoid.length ? `Avoid: ${avoid.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    if (!promptText) {
      return new Response(
        JSON.stringify({ error: 'Missing edit_prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deterministic plan: image_edit when source provided, otherwise text-to-image fallback
    const plan = resolveImageGenerationPlan({
      styleRefUrl: style_reference_url ?? null,
      characterRefUrl: source_image_url ?? null,
      textPrompt: providerPrompt,
      refModelId: requestedModel,
      defaultModelId: 'gmi/seedream-5-lite',
      textToImageLadder: ['gmi/nanobanana-2', 'gmi/seedream-5-lite'],
    });

    console.log(`Editing character ${character_id} | plan=`, plan);

    let editedImageUrl: string | null = null;

    if (plan.resolved_mode === 'reference_conditioned' && source_image_url) {
      if (plan.resolved_model.startsWith('gmi/')) {
        const gmiModel = plan.resolved_model.replace(/^gmi\//, '');
        const queue = await executeGmiQueueModel(gmiModel, {
          prompt: providerPrompt,
          image_url: source_image_url,
          reference_image_url: style_reference_url ?? undefined,
          output_format: 'jpeg',
          max_images: 1,
          watermark: false,
        });
        if (queue.success && queue.requestId) {
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            const s = await pollGmiQueueStatus(queue.requestId);
            if (s.success && s.data?.status === 'success') {
              editedImageUrl = s.data.outcome?.media_urls?.[0]?.url
                ?? s.data.outcome?.thumbnail_image_url
                ?? null;
              break;
            }
            if (s.success && (s.data?.status === 'failed' || s.data?.status === 'cancelled')) {
              break;
            }
          }
        }
      }

      if (!editedImageUrl) {
        const endpointModel = plan.resolved_model.startsWith('fal-ai/')
          ? plan.resolved_model
          : 'fal-ai/flux-pro/kontext';
        const isNanoBananaEdit = endpointModel.includes('nano-banana') && endpointModel.endsWith('/edit');
        const result = await fal.subscribe(endpointModel, {
          input: isNanoBananaEdit
            ? {
                image_urls: [source_image_url],
                prompt: providerPrompt,
                aspect_ratio: aspectRatio,
                num_images: 1,
                output_format: 'png',
              }
            : {
                image_url: source_image_url,
                prompt: providerPrompt,
                guidance_scale: 3.5,
                num_inference_steps: 28,
                output_format: 'jpeg',
              },
          logs: true,
        });
        editedImageUrl = (result as any)?.images?.[0]?.url ?? null;
      }
    } else {
      // Text-to-image fallback (no source image) — route through GMI ladder
      if (plan.resolved_model.startsWith('fal-ai/')) {
        const result = await fal.subscribe(plan.resolved_model, {
          input: {
            prompt: providerPrompt,
            aspect_ratio: aspectRatio,
            num_images: 1,
            output_format: 'png',
          },
          logs: true,
        });
        editedImageUrl = (result as any)?.images?.[0]?.url ?? null;
      } else {
        const gmiModel = plan.resolved_model.replace(/^gmi\//, '');
        const queue = await executeGmiQueueModel(gmiModel, {
          prompt: providerPrompt,
          size: '2048x2048',
          output_format: 'jpeg',
          max_images: 1,
          watermark: false,
        });
        if (queue.success && queue.requestId) {
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            const s = await pollGmiQueueStatus(queue.requestId);
            if (s.success && s.data?.status === 'success') {
              editedImageUrl = s.data.outcome?.media_urls?.[0]?.url
                ?? s.data.outcome?.thumbnail_image_url
                ?? null;
              break;
            }
            if (s.success && (s.data?.status === 'failed' || s.data?.status === 'cancelled')) {
              throw new Error(`GMI image generation ${s.data.status}`);
            }
          }
        }
      }
    }

    if (!editedImageUrl) {
      throw new Error('No image returned from edit/generation pipeline');
    }

    console.log(`Edit complete: ${editedImageUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        edited_image_url: editedImageUrl,
        character_id,
        model_alias: model_alias ?? null,
        structured_prompt: structuredPrompt,
        fallback_decision: plan,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Edit error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
