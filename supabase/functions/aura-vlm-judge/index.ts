/**
 * aura-vlm-judge - Edge function that evaluates media with Overshoot.
 *
 * The browser never receives OVERSHOOT_API_KEY. The function accepts image or
 * video URLs, sends them to Overshoot's OpenAI-compatible chat completions
 * endpoint, returns the legacy Aura score shape, and can optionally persist
 * draft-only observability artifacts.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import {
  aggregateAuraEvaluationRows,
  buildAuraEvaluationRows,
  executeOvershootJsonCompletion,
  normalizeAuraJudgeResponse,
  type AuraDraftImprovement,
  type AuraJudgeResponse,
  type OvershootContentPart,
  type OvershootChatMessage,
} from '../_shared/overshoot-client.ts';
import { buildEvaluationSummary, updateEvaluationSummary } from '../_shared/observability.ts';

type JudgeMode = 'quality' | 'safety' | 'aesthetic' | 'full';
type MediaType = 'image' | 'video';
type PersistableTargetType = 'storyline' | 'scene' | 'shot' | 'character';
type TargetType = PersistableTargetType | 'project';

interface JudgeRequest {
  mediaUrl: string;
  mediaType: MediaType;
  criteria?: string;
  mode?: JudgeMode;
  projectId?: string;
  targetType?: TargetType;
  targetId?: string;
  promptText?: string;
  referenceUrls?: string[];
  persist?: boolean;
}

const VALID_MODES = new Set<JudgeMode>(['quality', 'safety', 'aesthetic', 'full']);
const VALID_MEDIA_TYPES = new Set<MediaType>(['image', 'video']);
const PERSISTABLE_TARGET_TYPES = new Set<PersistableTargetType>(['storyline', 'scene', 'shot', 'character']);
const VIDEO_EXTENSION_RE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function getOvershootApiKey() {
  const key = Deno.env.get('OVERSHOOT_API_KEY');
  if (!key) {
    throw new Error('OVERSHOOT_API_KEY environment variable is not set');
  }
  return key;
}

function buildSystemPrompt(mode: JudgeMode, customCriteria?: string): string {
  const modeFocus: Record<JudgeMode, string> = {
    quality: 'Prioritize technical quality, image/video clarity, artifacts, resolution, lighting, exposure, and framing.',
    safety: 'Prioritize content safety, policy-sensitive elements, age appropriateness, violence, explicitness, and potentially harmful content.',
    aesthetic: 'Prioritize composition, visual taste, palette, mood, creative originality, and cinematic impact.',
    full: 'Evaluate technical quality, content safety, aesthetic quality, prompt adherence, and spatio-temporal consistency.',
  };

  return `You are Aura, WZRD Studio's principal VLM media judge.
Return strict JSON only. Do not include markdown, comments, or prose outside the JSON object.

Judgment focus:
${modeFocus[mode]}

For videos, judge spatio-temporal consistency: character/object persistence, camera coherence, motion plausibility, frame-to-frame artifacting, continuity of locations/wardrobe/props, and whether the temporal evolution matches the prompt.
For images, judge spatial consistency: anatomy, object placement, depth, lighting consistency, text/OCR artifacts, identity preservation, and composition.

All score fields must be integers from 0 to 100.
Draft improvements are advisory only. Never claim that an improvement has been applied.

Required JSON shape:
{
  "scores": {
    "overall": 0,
    "technical": 0,
    "aesthetic": 0,
    "safety": 0
  },
  "promptAdherence": 0,
  "characterConsistency": 0,
  "spatialConsistency": 0,
  "temporalConsistency": 0,
  "continuity": 0,
  "feedback": "concise but specific feedback",
  "tags": ["short_failure_or_strength_tag"],
  "suggestions": ["specific improvement suggestion"],
  "draftImprovements": [
    {
      "type": "rewrite_prompt_for_specificity | inject_prior_scene_refs | increase_identity_conditioning | rewrite_camera_instructions | swap_style_reference_board | manual_review_required",
      "title": "short action title",
      "rationale": "why this helps",
      "draftPrompt": "optional revised prompt text",
      "target": "optional target area"
    }
  ],
  "evidence": {
    "visibleStrengths": [],
    "visibleFailures": [],
    "spatioTemporalNotes": []
  }
}
${customCriteria ? `\nAdditional project criteria:\n${customCriteria}` : ''}`;
}

function inferContentPart(url: string): OvershootContentPart {
  return VIDEO_EXTENSION_RE.test(url)
    ? { type: 'video_url', video_url: { url } }
    : { type: 'image_url', image_url: { url } };
}

function buildUserContent(input: {
  mediaUrl: string;
  mediaType: MediaType;
  criteria?: string;
  promptText?: string;
  referenceUrls?: string[];
}): OvershootContentPart[] {
  const text = [
    'Evaluate the target media for Aura observability.',
    `Target media type: ${input.mediaType}.`,
    input.promptText ? `Original generation prompt:\n${input.promptText}` : null,
    input.criteria ? `Additional criteria:\n${input.criteria}` : null,
    input.referenceUrls?.length ? `Reference assets are included before the target media. Compare identity, style, and continuity against them.` : null,
    'Return only the requested JSON object.',
  ].filter(Boolean).join('\n\n');

  return [
    { type: 'text', text },
    ...(input.referenceUrls ?? []).filter((url) => typeof url === 'string' && url.trim().length > 0).map((url) => inferContentPart(url.trim())),
    input.mediaType === 'image'
      ? { type: 'image_url', image_url: { url: input.mediaUrl } }
      : { type: 'video_url', video_url: { url: input.mediaUrl } },
  ];
}

function isTargetType(value: unknown): value is TargetType {
  return value === 'project' || PERSISTABLE_TARGET_TYPES.has(value as PersistableTargetType);
}

function isPersistableTargetType(value: unknown): value is PersistableTargetType {
  return PERSISTABLE_TARGET_TYPES.has(value as PersistableTargetType);
}

function actionTypeFromDraft(type: AuraDraftImprovement['type']) {
  return {
    type,
    draft_only: true,
  };
}

function buildDraftRevisionActions(response: AuraJudgeResponse) {
  const draftActions = (response.draftImprovements ?? []).map((improvement) => ({
    ...actionTypeFromDraft(improvement.type),
    title: improvement.title,
    rationale: improvement.rationale,
    draft_prompt: improvement.draftPrompt ?? null,
    target: improvement.target ?? null,
  }));

  if (draftActions.length > 0) {
    return draftActions;
  }

  if (response.tags.includes('identity_drift')) {
    return [{ ...actionTypeFromDraft('increase_identity_conditioning'), title: 'Increase identity conditioning' }];
  }
  if (response.tags.some((tag) => tag.includes('continuity'))) {
    return [{ ...actionTypeFromDraft('inject_prior_scene_refs'), title: 'Inject prior scene references' }];
  }
  if (response.tags.some((tag) => tag.includes('camera'))) {
    return [{ ...actionTypeFromDraft('rewrite_camera_instructions'), title: 'Rewrite camera instructions' }];
  }
  return [{ ...actionTypeFromDraft('manual_review_required'), title: 'Manual review required' }];
}

async function persistAuraJudgment(input: {
  userId: string;
  projectId: string;
  targetType: TargetType;
  targetId?: string;
  mediaUrl: string;
  mediaType: MediaType;
  mode: JudgeMode;
  criteria?: string;
  modelUsed: string;
  completionId?: string;
  usage?: Record<string, unknown>;
  response: AuraJudgeResponse;
}) {
  const rows = buildAuraEvaluationRows(input.response, {
    modelUsed: input.modelUsed,
    mediaUrl: input.mediaUrl,
    mediaType: input.mediaType,
  });
  const { aggregates, disagreement, failureTags } = aggregateAuraEvaluationRows(rows);

  const { data: run, error: runError } = await supabase
    .from('evaluation_runs')
    .insert({
      project_id: input.projectId,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      mode: 'shadow',
      rubric_version: 'overshoot-aura-v1',
      rubric_snapshot: {
        mode: input.mode,
        criteria: input.criteria ?? null,
        media_type: input.mediaType,
        draft_only_improvements: true,
      },
      reliability_snapshot: {
        [input.modelUsed]: {
          provider: 'overshoot',
          confidence: 0.78,
        },
      },
      status: 'completed',
      aggregates,
      disagreement,
      created_by: input.userId,
      user_id: input.userId,
      models: [input.modelUsed],
      metadata: {
        provider: 'overshoot',
        completion_id: input.completionId ?? null,
        usage: input.usage ?? null,
        draft_only_improvements: true,
      },
    })
    .select('id')
    .single();

  if (runError || !run?.id) {
    throw new Error(runError?.message || 'Failed to persist Overshoot evaluation run');
  }

  const { error: resultError } = await supabase.from('evaluation_results').insert(
    rows.map((row) => ({
      run_id: run.id,
      judge_type: row.judge_type,
      judge_model: row.judge_model,
      judge_model_version: row.judge_model_version,
      score: row.score,
      judge_score: Math.round(row.score * 100),
      model_id: row.judge_model,
      test_id: 'overshoot-aura-v1',
      confidence: row.confidence,
      likert_label: row.likert_label,
      failure_tags: row.failure_tags,
      reasons: row.reasons,
      evidence: row.evidence,
      criteria_breakdown: row.criteria_breakdown,
      image_url: input.mediaType === 'image' ? input.mediaUrl : null,
    })),
  );

  if (resultError) {
    throw new Error(resultError.message);
  }

  const summary = buildEvaluationSummary(aggregates, disagreement, failureTags, run.id);
  if (input.targetId && (input.targetType === 'storyline' || input.targetType === 'scene' || input.targetType === 'shot')) {
    await updateEvaluationSummary(supabase, input.targetType, input.targetId, summary);
  } else if (input.targetId && input.targetType === 'character') {
    await supabase
      .from('characters')
      .update({ consistency_summary: summary })
      .eq('id', input.targetId);
  }

  if (failureTags.length > 0 && input.targetId && isPersistableTargetType(input.targetType)) {
    const metadata = {
      aggregates,
      disagreement,
      failure_tags: failureTags,
      provider: 'overshoot',
      draft_only_improvements: true,
    };

    const { data: existingTask } = await supabase
      .from('review_tasks')
      .select('id')
      .eq('project_id', input.projectId)
      .eq('target_type', input.targetType)
      .eq('target_id', input.targetId)
      .in('status', ['open', 'in_review'])
      .maybeSingle();

    if (existingTask?.id) {
      await supabase
        .from('review_tasks')
        .update({
          source_run_id: run.id,
          summary: `Overshoot flagged ${failureTags.join(', ')}`,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingTask.id);
    } else {
      await supabase.from('review_tasks').insert({
        project_id: input.projectId,
        target_type: input.targetType,
        target_id: input.targetId,
        source_run_id: run.id,
        status: 'open',
        priority: 1,
        mode: 'approve_reject',
        blocking: input.targetType === 'storyline',
        summary: `Overshoot flagged ${failureTags.join(', ')}`,
        metadata,
      });
    }

    await supabase.from('revision_plans').insert({
      project_id: input.projectId,
      target_type: input.targetType,
      target_id: input.targetId,
      source_run_id: run.id,
      trigger: {
        provider: 'overshoot',
        failure_tags: failureTags,
        draft_only_improvements: true,
      },
      actions: buildDraftRevisionActions(input.response),
      status: 'proposed',
    });
  }

  return run.id as string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed. Use POST.', 405);
    }

    const body: JudgeRequest = await req.json();
    const {
      mediaUrl,
      mediaType,
      criteria,
      mode = 'full',
      projectId,
      targetType,
      targetId,
      promptText,
      referenceUrls,
      persist = false,
    } = body;

    if (!mediaUrl || typeof mediaUrl !== 'string') {
      return errorResponse('Invalid or missing mediaUrl', 400);
    }
    if (!mediaType || !VALID_MEDIA_TYPES.has(mediaType)) {
      return errorResponse('Invalid mediaType. Must be "image" or "video"', 400);
    }
    if (!VALID_MODES.has(mode)) {
      return errorResponse('Invalid mode. Must be one of: quality, safety, aesthetic, full', 400);
    }
    if (targetType && !isTargetType(targetType)) {
      return errorResponse('Invalid targetType. Must be one of: project, storyline, scene, shot, character', 400);
    }
    if (persist && (!projectId || !targetType)) {
      return errorResponse('projectId and targetType are required when persist is true', 400);
    }
    if (persist && targetType !== 'project' && !targetId) {
      return errorResponse('targetId is required when persisting a non-project judgment', 400);
    }

    console.log('[aura-vlm-judge] Processing Overshoot evaluation:', {
      mediaType,
      mode,
      hasCustomCriteria: !!criteria,
      hasPromptText: !!promptText,
      referenceCount: referenceUrls?.length ?? 0,
      persist,
    });

    const messages: OvershootChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(mode, criteria) },
      {
        role: 'user',
        content: buildUserContent({
          mediaUrl: mediaUrl.trim(),
          mediaType,
          criteria,
          promptText,
          referenceUrls,
        }),
      },
    ];

    const overshootResult = await executeOvershootJsonCompletion({
      apiKey: getOvershootApiKey(),
      messages,
      maxTokens: 2400,
      temperature: 0.15,
    });

    const response: AuraJudgeResponse = {
      ...normalizeAuraJudgeResponse(overshootResult.json),
      modelUsed: overshootResult.modelUsed,
      usage: overshootResult.usage,
    };

    if (persist && projectId && targetType) {
      response.runId = await persistAuraJudgment({
        userId: user.id,
        projectId,
        targetType,
        targetId,
        mediaUrl: mediaUrl.trim(),
        mediaType,
        mode,
        criteria,
        modelUsed: overshootResult.modelUsed,
        completionId: overshootResult.completionId,
        usage: overshootResult.usage as Record<string, unknown> | undefined,
        response,
      });
    }

    console.log('[aura-vlm-judge] Overshoot judgment complete:', {
      overallScore: response.scores.overall,
      modelUsed: response.modelUsed,
      tagsCount: response.tags.length,
      suggestionsCount: response.suggestions.length,
      persisted: Boolean(response.runId),
    });

    return successResponse({
      success: true,
      data: response,
      mediaType,
      evaluationMode: mode,
      provider: 'overshoot',
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
