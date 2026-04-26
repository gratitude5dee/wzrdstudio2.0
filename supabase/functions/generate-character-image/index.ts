import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { getCharacterVisualSystemPrompt, getCharacterVisualUserPrompt } from '../_shared/prompts.ts';
import { executeGmiChatCompletion, executeGmiQueueModel, pollGmiQueueStatus } from '../_shared/gmi-client.ts';
import { resolveImageGenerationPlan } from '../_shared/image-fallback.ts';

interface RequestBody {
  character_id: string;
  project_id?: string;
  style_reference_url?: string;
  character_reference_url?: string;
}

interface ProjectData {
  genre?: string | null;
  tone?: string | null;
  video_style?: string | null;
  cinematic_inspiration?: string | null;
  style_reference_asset_id?: string | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  try {
    const { character_id, project_id, style_reference_url, character_reference_url }: RequestBody = await req.json();
    if (!character_id) return errorResponse('character_id is required', 400);

    console.log(`Generating image for character ID: ${character_id}`);

    await supabaseClient
      .from('characters')
      .update({ image_status: 'generating', image_generation_error: null })
      .eq('id', character_id);

    // 1. Fetch Character Data
    const { data: charData, error: fetchError } = await supabaseClient
      .from('characters')
      .select(`
        name,
        description,
        project:projects (
          genre, tone, video_style, cinematic_inspiration, style_reference_asset_id
        )
      `)
      .eq('id', character_id)
      .single();

    if (fetchError || !charData) {
      return errorResponse('Character not found', 404, fetchError?.message);
    }

    const projectData: ProjectData | undefined = Array.isArray(charData.project)
      ? charData.project[0]
      : charData.project;

    // 2. Generate Visual Prompt using GMI Cloud (Gemini 3.1 Flash-Lite)
    console.log(`Generating visual prompt for character: ${charData.name}`);

    const visualPromptSystem = getCharacterVisualSystemPrompt();
    const visualPromptUser = getCharacterVisualUserPrompt(
      charData.name,
      charData.description,
      projectData
    );

    const promptResult = await executeGmiChatCompletion(
      'google/gemini-3.1-flash-lite-preview',
      [
        { role: 'system', content: visualPromptSystem },
        { role: 'user', content: visualPromptUser }
      ],
      { temperature: 0.7, max_tokens: 150 }
    );

    if (!promptResult.success || !promptResult.data) {
      console.error('GMI prompt generation failed:', promptResult.error);
      return errorResponse('Failed to generate visual prompt', 500);
    }

    const visualPrompt = promptResult.data.choices?.[0]?.message?.content?.trim();
    if (!visualPrompt) {
      return errorResponse('Failed to generate visual prompt', 500);
    }

    console.log(`Generated visual prompt: ${visualPrompt}`);

    // 3. Resolve image generation plan deterministically
    const fallbackDecision = resolveImageGenerationPlan({
      styleRefUrl: style_reference_url ?? null,
      characterRefUrl: character_reference_url ?? null,
      textPrompt: visualPrompt,
      refModelId: 'seedream-5.0-lite',
      defaultModelId: 'seedream-5.0-lite',
      textToImageLadder: ['nanobanana-2', 'seedream-5.0-lite', 'seedream-4-0-250828'],
    });
    console.log(`[generate-character-image] Plan:`, fallbackDecision);

    // 4. Generate Image using GMI Cloud (resolved model from plan)
    const resolvedGmiModel = fallbackDecision.resolved_model;
    console.log(`Calling GMI Cloud (${resolvedGmiModel}) for image generation...`);

    const queueResult = await executeGmiQueueModel(resolvedGmiModel, {
      prompt: visualPrompt,
      size: "2048x2048",
      output_format: "jpeg",
      max_images: 1,
      watermark: false,
    });

    if (!queueResult.success || !queueResult.requestId) {
      console.error('GMI queue submission failed:', queueResult.error);
      return errorResponse('Failed to submit image generation', 500);
    }

    console.log(`GMI request submitted: ${queueResult.requestId}`);

    // Poll for completion
    const MAX_POLLS = 60;
    const POLL_INTERVAL = 3000;
    let imageUrl: string | undefined;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      const status = await pollGmiQueueStatus(queueResult.requestId);

      if (!status.success || !status.data) {
        console.warn(`Poll error: ${status.error}`);
        continue;
      }

      const s = status.data.status;
      console.log(`Poll ${i + 1}: ${s}`);

      if (s === 'success') {
        imageUrl = status.data.outcome?.media_urls?.[0]?.url
          || status.data.outcome?.thumbnail_image_url;
        break;
      }

      if (s === 'failed' || s === 'cancelled') {
        throw new Error(`GMI image generation ${s}`);
      }
    }

    if (!imageUrl) {
      throw new Error('GMI image generation timed out');
    }

    console.log(`Generated Image URL: ${imageUrl}`);

    // 4. Update character and return
    const successResponseData = {
      success: true,
      character_id,
      image_url: imageUrl,
      visual_prompt: visualPrompt,
      fallback_decision: fallbackDecision,
    };

    // Update character in background
    // @ts-ignore - EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        supabaseClient
          .from('characters')
          .update({ image_url: imageUrl, image_status: 'completed', image_generation_error: null })
          .eq('id', character_id)
          .then(({ error }) => {
            if (error) console.error(`Background update failed for character ${character_id}:`, error);
          })
      );
    } else {
      await supabaseClient
        .from('characters')
        .update({ image_url: imageUrl, image_status: 'completed', image_generation_error: null })
        .eq('id', character_id);
    }

    return successResponse(successResponseData);

  } catch (error: unknown) {
    console.error(`Error in generate-character-image:`, error);
    const errorMsg = getErrorMessage(error);

    try {
      const { character_id } = await req.json();
      if (character_id) {
        await supabaseClient
          .from('characters')
          .update({ image_status: 'failed', image_generation_error: errorMsg })
          .eq('id', character_id);
      }
    } catch { /* ignore */ }

    return errorResponse(errorMsg, 500);
  }
});
