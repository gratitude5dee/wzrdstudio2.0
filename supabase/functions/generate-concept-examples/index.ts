import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { executeGmiChatCompletion } from "../_shared/gmi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a creative storytelling assistant that generates diverse and engaging story concepts. Generate 3 unique story concepts with variety - include different genres, tones, and formats. Each concept should be compelling and distinct.

IMPORTANT: You must respond with ONLY a valid JSON object in this exact format, no additional text:
{
  "concepts": [
    {"title": "Title 1", "description": "1-2 sentence description", "type": "logline"},
    {"title": "Title 2", "description": "1-2 sentence description", "type": "storyline"},
    {"title": "Title 3", "description": "1-2 sentence description", "type": "logline"}
  ]
}`;

const USER_PROMPT = "Generate 3 diverse story concepts. For each, provide a title and a 1-2 sentence description. Include a mix of loglines (brief, punchy concepts) and storylines (slightly more detailed narratives). Make them creative and varied in genre and tone. Respond with ONLY the JSON object.";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Generating concept examples with GMI Cloud (Gemini 3.1 Flash-Lite)");

    const result = await executeGmiChatCompletion(
      'google/gemini-3.1-flash-lite-preview',
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT },
      ],
      { temperature: 0.9, max_tokens: 500 }
    );

    if (!result.success || !result.data) {
      console.error("GMI Cloud error:", result.error);
      throw new Error(result.error || "GMI Cloud request failed");
    }

    const content = result.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in GMI Cloud response");
    }

    // Parse the JSON from the response
    let concepts;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        concepts = JSON.parse(jsonMatch[0]);
      } else {
        concepts = JSON.parse(content);
      }
    } catch (parseError) {
      console.error("Failed to parse concepts JSON:", parseError, "Content:", content);
      throw new Error("Failed to parse concepts from AI response");
    }

    console.log("Generated concepts:", concepts);

    return new Response(
      JSON.stringify(concepts),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in generate-concept-examples:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to generate concepts" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
