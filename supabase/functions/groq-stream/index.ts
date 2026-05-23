import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors, errorResponse } from '../_shared/response.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  try {
    const { prompt, systemPrompt, model = 'llama-3.3-70b-versatile', temperature = 0.7, maxTokens = 4096 } = await req.json();
    
    if (!prompt) {
      return errorResponse('Prompt is required', 400);
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const GMI_CLOUD_API_KEY = Deno.env.get("GMI_CLOUD_API_KEY");

    // If no Groq key but GMI key exists, go directly to GMI
    if (!GROQ_API_KEY && GMI_CLOUD_API_KEY) {
      return await gmiCloudFallback(prompt, systemPrompt, temperature, maxTokens);
    }

    if (!GROQ_API_KEY) {
      return errorResponse('No API key configured (GROQ_API_KEY or GMI_CLOUD_API_KEY)', 500);
    }

    console.log(`Groq streaming request - model: ${model}, prompt length: ${prompt.length}`);

    const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groq API error: ${response.status} - ${errorText}`);
      
      // Fallback to GMI on 401 (invalid key)
      if (response.status === 401 && GMI_CLOUD_API_KEY) {
        console.warn('Groq 401, falling back to GMI Cloud');
        return await gmiCloudFallback(prompt, systemPrompt, temperature, maxTokens);
      }

      if (response.status === 429) {
        // Try GMI fallback on rate limit too
        if (GMI_CLOUD_API_KEY) {
          console.warn('Groq 429, falling back to GMI Cloud');
          return await gmiCloudFallback(prompt, systemPrompt, temperature, maxTokens);
        }
        return errorResponse('Rate limited by Groq. Please wait and try again.', 429);
      }
      if (response.status === 402) {
        return errorResponse('Groq API payment required.', 402);
      }
      return errorResponse(`Groq API error: ${response.statusText}`, response.status);
    }

    // Pass through the SSE stream from Groq
    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      },
    });

  } catch (error) {
    console.error('Groq stream error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(errorMessage, 500);
  }
});

/**
 * GMI Cloud fallback — returns a synthetic SSE stream from a non-streaming GMI response.
 */
async function gmiCloudFallback(
  prompt: string,
  systemPrompt: string | undefined,
  temperature: number,
  maxTokens: number
): Promise<Response> {
  console.log('[GMI Fallback] Using GMI Cloud for text generation');

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const result = await executeGmiChatCompletion('deepseek-ai/DeepSeek-R1-0528', messages, {
    temperature,
    max_tokens: maxTokens,
  });

  if (!result.success || !result.data) {
    return errorResponse(result.error || 'GMI Cloud fallback failed', 500);
  }

  const content = result.data.choices?.[0]?.message?.content || '';

  // Convert to SSE format so the stream processor in generate-storylines works
  const encoder = new TextEncoder();
  const sseData = [
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    `data: [DONE]\n\n`,
  ];

  const body = encoder.encode(sseData.join(''));

  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    },
  });
}
