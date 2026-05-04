import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as fal from "npm:@fal-ai/serverless-client";
import { resolveImageGenerationPlan } from "../_shared/image-fallback.ts";
import { executeGmiQueueModel, pollGmiQueueStatus } from "../_shared/gmi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    } = await req.json();

    if (!edit_prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing edit_prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deterministic plan: image_edit when source provided, otherwise text-to-image fallback
    const plan = resolveImageGenerationPlan({
      styleRefUrl: style_reference_url ?? null,
      characterRefUrl: source_image_url ?? null,
      textPrompt: edit_prompt,
      refModelId: preferred_model ?? 'gmi/nanobanana-2',
      defaultModelId: 'gmi/seedream-5-lite',
      textToImageLadder: ['gmi/nanobanana-2', 'gmi/seedream-5-lite'],
    });

    console.log(`Editing character ${character_id} | plan=`, plan);

    let editedImageUrl: string | null = null;

    if (plan.resolved_mode === 'reference_conditioned' && source_image_url) {
      if (plan.resolved_model.startsWith('gmi/')) {
        const gmiModel = plan.resolved_model.replace(/^gmi\//, '');
        const queue = await executeGmiQueueModel(gmiModel, {
          prompt: edit_prompt,
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
        const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
          input: {
            image_url: source_image_url,
            prompt: edit_prompt,
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
      const gmiModel = plan.resolved_model.replace(/^gmi\//, '');
      const queue = await executeGmiQueueModel(gmiModel, {
        prompt: edit_prompt,
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

    if (!editedImageUrl) {
      throw new Error('No image returned from edit/generation pipeline');
    }

    console.log(`Edit complete: ${editedImageUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        edited_image_url: editedImageUrl,
        character_id,
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
