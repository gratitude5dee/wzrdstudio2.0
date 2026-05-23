import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { fetchWithRetry } from '../_shared/retry.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';

async function resolveGmiEndpoint(modelId: string, fallbackId: string): Promise<string> {
  const selected = await getCatalogModelById(modelId, { mediaType: 'text', enabledOnly: false });
  if (selected?.provider === 'gmi-cloud') {
    return selected.endpointId;
  }

  const fallback = await getCatalogModelById(fallbackId, { mediaType: 'text', enabledOnly: false });
  return fallback?.endpointId ?? 'deepseek-ai/DeepSeek-R1-0528';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const { 
      systemPrompt, 
      prompt, 
      model = 'llama-3.3-70b-versatile',
      responseSchema,
      temperature = 0.7
    } = await req.json();

    if (!prompt) {
      return errorResponse('Prompt is required', 400);
    }

    // Build the system message with schema instructions for JSON output
    let fullSystemPrompt = systemPrompt || '';
    if (responseSchema) {
      fullSystemPrompt += `\n\nIMPORTANT: You MUST respond with valid JSON that matches this exact schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nDo not include any text before or after the JSON. Only output the JSON object.`;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (fullSystemPrompt) {
      messages.push({ role: "system", content: fullSystemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    // Determine which backend to use
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const GMI_CLOUD_API_KEY = Deno.env.get("GMI_CLOUD_API_KEY");
    const useGmi = !GROQ_API_KEY || GMI_CLOUD_API_KEY;

    let content: string;
    let usage: any;

    if (useGmi && GMI_CLOUD_API_KEY) {
      // Route through GMI Cloud
      const gmiModel = await resolveGmiEndpoint(model, 'gmi/deepseek-r1');
      console.log(`Routing through GMI Cloud with model: ${gmiModel}`);

      const gmiResult = await executeGmiChatCompletion(gmiModel, messages, {
        temperature,
        max_tokens: 8192,
      });

      if (!gmiResult.success || !gmiResult.data) {
        return errorResponse(gmiResult.error || 'GMI Cloud request failed', 500);
      }

      content = gmiResult.data.choices?.[0]?.message?.content || '';
      usage = gmiResult.data.usage;
    } else {
      // Groq path
      if (!GROQ_API_KEY) {
        return errorResponse('No API key configured (GROQ_API_KEY or GMI_CLOUD_API_KEY)', 500);
      }

      console.log(`Generating structured storyline with Groq model: ${model}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      let response;
      try {
        response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: 8192,
            response_format: { type: "json_object" }
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return errorResponse("Request timeout (120s exceeded)", 504);
        }
        throw fetchError;
      }

      if (!response.ok) {
        // If Groq returns 401 and GMI key exists, fallback
        if (response.status === 401 && GMI_CLOUD_API_KEY) {
          console.warn('Groq 401, falling back to GMI Cloud');
          const gmiResult = await executeGmiChatCompletion('deepseek-ai/DeepSeek-R1-0528', messages, {
            temperature,
            max_tokens: 8192,
          });
          if (!gmiResult.success || !gmiResult.data) {
            return errorResponse(gmiResult.error || 'GMI fallback failed', 500);
          }
          content = gmiResult.data.choices?.[0]?.message?.content || '';
          usage = gmiResult.data.usage;

          // Skip to parsing below
          return finishParsing(content, usage, model);
        }

        if (response.status === 429) {
          return errorResponse("Rate limits exceeded, please try again later.", 429);
        }
        const errorText = await response.text();
        console.error("Groq API error:", response.status, errorText);
        return errorResponse("Groq API error", 500, { details: errorText });
      }

      const data = await response.json();
      content = data.choices?.[0]?.message?.content || '';
      usage = data.usage;
    }

    return finishParsing(content, usage, model);

  } catch (error) {
    console.error("Error in storyline-generation:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});

function finishParsing(content: string, usage: any, model: string) {
  if (!content || content.trim() === '') {
    console.error('Empty content from API:', { model, usage });
    return errorResponse("Empty response from AI", 500, { model, usage });
  }

  let parsedContent;
  try {
    parsedContent = JSON.parse(content);
  } catch (parseError: unknown) {
    // Try extracting JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsedContent = JSON.parse(jsonMatch[1].trim());
      } catch { /* fall through */ }
    }

    if (!parsedContent) {
      const parseMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
      console.error("Failed to parse JSON response:", {
        error: parseMessage,
        contentPreview: content.substring(0, 500),
        model
      });
      return errorResponse("Invalid JSON response from AI", 500, { 
        contentPreview: content.substring(0, 200),
        error: parseMessage,
        model
      });
    }
  }

  return successResponse({
    text: content,
    parsed: parsedContent,
    usage
  });
}
