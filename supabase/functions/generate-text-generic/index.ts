
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
  shouldSkipCreditBilling,
} from '../_shared/credits.ts';

interface RequestBody {
  context: string;
  current_text?: string;
  user_prompt: string;
  project_id?: string;
  model?: string;
  request_id?: string;
}

interface GenerateTextMetadata {
  project_id?: string;
  model: string;
  context: string;
  user_prompt: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // Authenticate the request
    const user = await authenticateRequest(req.headers);

    // Parse request body
    const { context, current_text, user_prompt, project_id, model = 'llama3-8b-8192', request_id }: RequestBody = await req.json();

    // Validate required fields
    if (!context || !user_prompt) {
      return errorResponse('Missing required fields: context and user_prompt are required', 400);
    }

    // Create Supabase client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Create metadata for credit transaction
    const metadata: GenerateTextMetadata = {
      project_id,
      model,
      context,
      user_prompt
    };

    const reservation = await reserveCredits({
      supabase: supabaseClient,
      userId: user.id,
      resourceType: 'text',
      requestedAmount: 1,
      referenceType: 'generate_text_generic',
      referenceId: project_id || 'global',
      idempotencyKey: buildCreditIdempotencyKey(
        'generate-text-generic',
        user.id,
        project_id || 'no-project',
        request_id || crypto.randomUUID()
      ),
      metadata: {
        ...metadata,
        endpoint: 'generate-text-generic',
      },
      skipBilling: shouldSkipCreditBilling(req.headers),
    });

    // Construct the meta-prompt
    const metaPrompt = `
Context: ${context}
${current_text ? `Current text: ${current_text}` : ''}
User's instruction: ${user_prompt}

Please provide a response that addresses the user's instruction while considering the given context.
Focus on being helpful, clear, and concise. If there is current text provided, incorporate or reference it appropriately in your response.`;

    console.log('Calling groq-chat with prompt:', metaPrompt);

    // Call the groq-chat function
    let groqResponse: any = null;
    try {
      const { data, error: groqError } = await supabaseClient.functions.invoke('groq-chat', {
        body: {
          prompt: metaPrompt,
          model,
          temperature: 0.7,
          maxTokens: 1024
        }
      });

      if (groqError || !data?.text) {
        console.error('Groq chat error:', groqError || 'No response text');
        await releaseCredits({
          supabase: supabaseClient,
          holdId: reservation.holdId,
          skipped: reservation.skipped,
          reason: 'provider_failed',
          metadata: { endpoint: 'generate-text-generic' },
        });
        return errorResponse('Failed to generate text', 500);
      }

      groqResponse = data;
      await commitCredits({
        supabase: supabaseClient,
        holdId: reservation.holdId,
        skipped: reservation.skipped,
        amount: 1,
        metadata: { endpoint: 'generate-text-generic' },
      });
    } catch (providerError) {
      await releaseCredits({
        supabase: supabaseClient,
        holdId: reservation.holdId,
        skipped: reservation.skipped,
        reason: 'provider_exception',
        metadata: { endpoint: 'generate-text-generic' },
      });
      throw providerError;
    }

    // Return the generated text
    return successResponse({
      generated_text: groqResponse.text.trim()
    });

  } catch (error: unknown) {
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }
    console.error('Error in generate-text-generic:', error);
    const errorMsg = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(errorMsg, 500);
  }
});
