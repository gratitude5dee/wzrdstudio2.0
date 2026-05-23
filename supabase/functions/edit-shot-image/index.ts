import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      shot_id,
      image_url,
      edit_prompt,
      original_prompt,
      model_alias,
      preferred_model,
      structured_prompt,
    } = await req.json();

    if (!shot_id || !image_url || !edit_prompt) {
      throw new Error('Missing required parameters');
    }

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
    const resolvedModel = resolveModelAlias(model_alias, preferred_model);
    const endpointModel = resolvedModel.startsWith('fal-ai/')
      ? resolvedModel
      : DEFAULT_NANO_BANANA_FAST_EDIT_MODEL;
    const providerPrompt = [
      promptText,
      original_prompt ? `Original context: ${original_prompt}` : null,
      preserve.length ? `Preserve: ${preserve.join(', ')}` : null,
      avoid.length ? `Avoid: ${avoid.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    console.log('Editing image for shot:', shot_id);
    console.log('Edit model:', endpointModel);
    console.log('Edit prompt:', providerPrompt);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For now, we'll use FAL.ai's image-to-image or flux-pro for editing
    // You would integrate with FAL.ai API here
    const falKey = Deno.env.get('FAL_KEY');

    if (!falKey) {
      throw new Error('FAL_KEY not configured');
    }

    const falResponse = await fetch(`https://fal.run/${endpointModel}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: providerPrompt,
        image_urls: [image_url],
        aspect_ratio: aspectRatio,
        num_images: 1,
        output_format: 'png',
      })
    });

    if (!falResponse.ok) {
      const errorText = await falResponse.text();
      console.error('FAL.ai error:', errorText);
      throw new Error(`FAL.ai request failed: ${falResponse.statusText}`);
    }

    const falData = await falResponse.json();
    const editedImageUrl = falData.images?.[0]?.url;

    if (!editedImageUrl) {
      throw new Error('No edited image returned from FAL.ai');
    }

    // Get current image history
    const { data: shot, error: fetchError } = await supabase
      .from('shots')
      .select('image_history')
      .eq('id', shot_id)
      .single();

    if (fetchError) {
      console.error('Error fetching shot:', fetchError);
    }

    const history = shot?.image_history || [];

    // Add previous image to history
    history.push({
      url: image_url,
      type: 'pre-edit',
      edit_prompt: promptText,
      model_alias: model_alias ?? null,
      resolved_model: endpointModel,
      structured_prompt: structuredPrompt,
      timestamp: new Date().toISOString()
    });

    // Update shot with new image and history
    const { error: updateError } = await supabase
      .from('shots')
      .update({
        image_url: editedImageUrl,
        image_history: history,
        updated_at: new Date().toISOString()
      })
      .eq('id', shot_id);

    if (updateError) {
      console.error('Error updating shot:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        image_url: editedImageUrl,
        history_length: history.length,
        model_alias: model_alias ?? null,
        resolved_model: endpointModel,
        structured_prompt: structuredPrompt,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: unknown) {
    console.error('Edit shot image error:', error);
    const message = error instanceof Error ? error.message : 'Failed to edit image';
    const details = error instanceof Error ? error.toString() : String(error);
    return new Response(
      JSON.stringify({
        error: message,
        details: details
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
