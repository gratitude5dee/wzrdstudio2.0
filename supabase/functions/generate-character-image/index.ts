import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { getCharacterVisualSystemPrompt, getCharacterVisualUserPrompt } from '../_shared/prompts.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';
import { submitToFalQueue } from '../_shared/falai-client.ts';

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
    const { character_id, style_reference_url }: RequestBody = await req.json();
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

    // 2. Generate Visual Prompt using GMI Cloud LLM
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

    // 3. Generate Image using fal.ai nano-banana-2
    console.log(`Calling fal.ai nano-banana-2 for image generation...`);

    const falResult = await submitToFalQueue<{ images: Array<{ url: string }>; description?: string }>(
      'fal-ai/nano-banana-2',
      {
        prompt: visualPrompt,
        resolution: '1K',
        aspect_ratio: '1:1',
        output_format: 'jpeg',
        num_images: 1,
      },
      { pollInterval: 3000, maxAttempts: 60 }
    );

    if (!falResult.success || !falResult.data) {
      console.error('fal.ai image generation failed:', falResult.error);
      throw new Error(falResult.error || 'fal.ai image generation failed');
    }

    const imageUrl = falResult.data.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL in fal.ai response');
    }

    console.log(`Generated Image URL: ${imageUrl}`);

    // 4. Update character and return
    const successResponseData = {
      success: true,
      character_id,
      image_url: imageUrl,
      visual_prompt: visualPrompt,
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