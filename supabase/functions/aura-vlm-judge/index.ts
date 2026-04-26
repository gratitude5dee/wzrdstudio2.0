/**
 * aura-vlm-judge – Edge function that evaluates media (images/videos) using
 * Gemini 3.1 Flash-Lite via GMI Cloud API.
 *
 * Provides structured quality, safety, and aesthetic judgments with scores,
 * feedback, tags, and improvement suggestions.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';
import type { GmiChatMessage } from '../_shared/gmi-types.ts';

// ── Request/Response types ───────────────────────────────────────────────────

interface JudgeRequest {
  mediaUrl: string;           // URL of image or video to evaluate
  mediaType: 'image' | 'video';  // Type of media
  criteria?: string;          // Optional custom evaluation criteria
  mode?: 'quality' | 'safety' | 'aesthetic' | 'full';  // Evaluation mode
}

interface JudgeResponse {
  scores: {
    overall: number;        // 0-100
    technical?: number;     // 0-100
    aesthetic?: number;     // 0-100
    safety?: number;        // 0-100
  };
  feedback: string;         // Natural language feedback
  tags: string[];           // Descriptive tags
  suggestions: string[];    // Improvement suggestions
}

// ── System prompts by evaluation mode ────────────────────────────────────────

function buildSystemPrompt(evaluationMode: 'quality' | 'safety' | 'aesthetic' | 'full', customCriteria?: string): string {
  const basePrompt = `You are an expert media judge evaluating images and videos.
Your role is to provide structured, constructive feedback with clear scores (0-100).`;

  const modePrompts: Record<string, string> = {
    quality: `
Evaluate the TECHNICAL QUALITY of the media:
- Resolution and clarity
- Noise and artifacts
- Composition and framing
- Lighting and exposure
- Color accuracy and grading

Provide scores for:
- technical: Overall technical quality (0-100)
- overall: Same as technical for quality mode

Include feedback on specific technical aspects and actionable suggestions.`,

    safety: `
Evaluate the CONTENT SAFETY of the media:
- Explicit or violent content
- Age-appropriateness
- Potentially harmful elements
- Compliance with content policies
- Sensitivity and respect concerns

Provide scores for:
- safety: Content safety rating (0-100, where 100 = fully safe)
- overall: Overall safety assessment (0-100)

Include feedback on any safety concerns and recommendations.`,

    aesthetic: `
Evaluate the ARTISTIC QUALITY of the media:
- Color palette and harmony
- Composition and visual balance
- Mood and emotional impact
- Storytelling and narrative elements
- Creative originality
- Visual appeal and impact

Provide scores for:
- aesthetic: Artistic quality (0-100)
- overall: Overall aesthetic assessment (0-100)

Include feedback on artistic strengths and creative suggestions.`,

    full: `
Evaluate the media across ALL DIMENSIONS:
- TECHNICAL QUALITY: Resolution, clarity, noise, composition, lighting, color
- CONTENT SAFETY: Explicit content, appropriateness, compliance, sensitivity
- AESTHETIC QUALITY: Color harmony, composition, mood, storytelling, originality

Provide scores for:
- technical: Technical quality (0-100)
- aesthetic: Artistic quality (0-100)
- safety: Content safety (0-100, where 100 = fully safe)
- overall: Weighted overall score (0-100)

Calculate overall as: (technical * 0.35 + aesthetic * 0.35 + safety * 0.30)

Include comprehensive feedback on all dimensions and prioritized suggestions.`,
  };

  let fullPrompt = basePrompt + '\n' + (modePrompts[evaluationMode] || modePrompts.full);

  if (customCriteria) {
    fullPrompt += `\n\nADDITIONAL EVALUATION CRITERIA:\n${customCriteria}`;
  }

  fullPrompt += `\n\nRespond in JSON format with the structure:
{
  "scores": {
    "overall": <number>,
    "technical": <number if applicable>,
    "aesthetic": <number if applicable>,
    "safety": <number if applicable>
  },
  "feedback": "<comprehensive natural language feedback>",
  "tags": ["<tag1>", "<tag2>", ...],
  "suggestions": ["<suggestion1>", "<suggestion2>", ...]
}`;

  return fullPrompt;
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    await authenticateRequest(req.headers);

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed. Use POST.', 405);
    }

    const body: JudgeRequest = await req.json();
    const {
      mediaUrl,
      mediaType,
      criteria,
      mode = 'full',
    } = body;

    // ── Validate request ────────────────────────────────────────────────────
    if (!mediaUrl || typeof mediaUrl !== 'string') {
      return errorResponse('Invalid or missing mediaUrl', 400);
    }

    if (!mediaType || !['image', 'video'].includes(mediaType)) {
      return errorResponse('Invalid mediaType. Must be "image" or "video"', 400);
    }

    if (mode && !['quality', 'safety', 'aesthetic', 'full'].includes(mode)) {
      return errorResponse('Invalid mode. Must be one of: quality, safety, aesthetic, full', 400);
    }

    console.log('[aura-vlm-judge] Processing:', {
      mediaType,
      mode,
      hasCustomCriteria: !!criteria,
    });

    // ── Build system prompt ─────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(mode as 'quality' | 'safety' | 'aesthetic' | 'full', criteria);

    // ── Build vision content ────────────────────────────────────────────────
    const contentPart = mediaType === 'image'
      ? { type: 'image_url' as const, image_url: { url: mediaUrl } }
      : { type: 'video_url' as const, video_url: { url: mediaUrl } };
    const userMessage: GmiChatMessage = {
      role: 'user',
      content: [
        contentPart,
        {
          type: 'text' as const,
          text: 'Please evaluate this media and provide your assessment in the requested JSON format.',
        },
      ],
    };

    // ── Call Gemini 3.1 Flash-Lite via GMI Cloud ────────────────────────────
    const gmiResult = await executeGmiChatCompletion(
      'google/gemini-3.1-flash-lite-preview',
      [
        { role: 'system', content: systemPrompt },
        userMessage,
      ],
      {
        max_tokens: 2000,
        temperature: 0.7,
        stream: false,
      }
    );

    if (!gmiResult.success) {
      return errorResponse(gmiResult.error ?? 'Gemini vision analysis failed', 502);
    }

    // ── Extract and parse response ──────────────────────────────────────────
    const responseData = gmiResult.data;
    if (!responseData?.choices?.[0]?.message?.content) {
      return errorResponse('Invalid response format from Gemini', 502);
    }

    const responseText = responseData.choices[0].message.content;

    // ── Extract JSON from response (handle markdown code blocks) ────────────
    let judgmentJson: JudgeResponse;
    try {
      // Try to parse directly first
      judgmentJson = JSON.parse(responseText);
    } catch {
      // Try to extract from markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        judgmentJson = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Could not parse JSON response from Gemini');
      }
    }

    // ── Validate response structure ─────────────────────────────────────────
    if (!judgmentJson.scores || typeof judgmentJson.scores.overall !== 'number') {
      return errorResponse('Invalid judgment response structure', 502);
    }

    // ── Ensure required fields exist ────────────────────────────────────────
    const response: JudgeResponse = {
      scores: {
        overall: Math.max(0, Math.min(100, judgmentJson.scores.overall)),
        ...(judgmentJson.scores.technical !== undefined && { technical: Math.max(0, Math.min(100, judgmentJson.scores.technical)) }),
        ...(judgmentJson.scores.aesthetic !== undefined && { aesthetic: Math.max(0, Math.min(100, judgmentJson.scores.aesthetic)) }),
        ...(judgmentJson.scores.safety !== undefined && { safety: Math.max(0, Math.min(100, judgmentJson.scores.safety)) }),
      },
      feedback: judgmentJson.feedback || 'No feedback provided',
      tags: Array.isArray(judgmentJson.tags) ? judgmentJson.tags : [],
      suggestions: Array.isArray(judgmentJson.suggestions) ? judgmentJson.suggestions : [],
    };

    console.log('[aura-vlm-judge] Judgment complete:', {
      overallScore: response.scores.overall,
      tagsCount: response.tags.length,
      suggestionsCount: response.suggestions.length,
    });

    return successResponse({
      success: true,
      data: response,
      mediaType,
      evaluationMode: mode,
    });
  } catch (error) {
    console.error('[aura-vlm-judge] Error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    const message = error instanceof Error ? error.message : 'Failed to evaluate media';
    return errorResponse(message, 500);
  }
});
