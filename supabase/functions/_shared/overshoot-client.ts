export type OvershootContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } };

export interface OvershootChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OvershootContentPart[];
}

export interface OvershootModel {
  id: string;
  status?: string;
}

export interface OvershootUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface OvershootJsonCompletionResult {
  json: Record<string, unknown>;
  modelUsed: string;
  completionId?: string;
  usage?: OvershootUsage;
}

export type AuraImprovementType =
  | 'rewrite_prompt_for_specificity'
  | 'inject_prior_scene_refs'
  | 'increase_identity_conditioning'
  | 'rewrite_camera_instructions'
  | 'swap_style_reference_board'
  | 'manual_review_required';

export interface AuraDraftImprovement {
  type: AuraImprovementType;
  title: string;
  rationale: string;
  draftPrompt?: string;
  target?: string;
}

export interface AuraJudgeResponse {
  scores: {
    overall: number;
    technical?: number;
    aesthetic?: number;
    safety?: number;
  };
  promptAdherence?: number;
  characterConsistency?: number;
  spatialConsistency?: number;
  temporalConsistency?: number;
  continuity?: number;
  feedback: string;
  tags: string[];
  suggestions: string[];
  draftImprovements?: AuraDraftImprovement[];
  evidence?: Record<string, unknown>;
  modelUsed?: string;
  usage?: OvershootUsage;
  runId?: string;
}

export interface AuraEvaluationRow {
  judge_type: 'prompt_adherence' | 'visual_quality' | 'character_consistency' | 'continuity' | 'storyline' | 'canon_compliance';
  judge_model: string;
  judge_model_version: string;
  score: number;
  confidence: number;
  likert_label: string;
  failure_tags: string[];
  reasons: string[];
  evidence: Record<string, unknown>;
  criteria_breakdown: Record<string, number>;
}

export type OvershootStreamAction = 'create' | 'get' | 'keepalive' | 'delete';

const OVERSHOOT_BASE_URL = 'https://api.overshoot.ai/v1';
const OVERSHOOT_MODEL_PREFERENCE = [
  'Qwen/Qwen3.6-27B-FP8',
  'google/gemma-4-31B-it',
  'Qwen/Qwen3.6-35B-A3B-FP8',
  'google/gemma-4-26B-A4B-it',
  'Hcompany/Holo3-35B-A3B',
];

class OvershootNonRetryableError extends Error {}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeScore100(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === undefined) return undefined;
  const scaled = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return clamp(Math.round(scaled), 0, 100);
}

function scoreToUnit(value: number | undefined): number {
  return clamp((value ?? 0) / 100, 0, 1);
}

function avg(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) return 0;
  return clamp(usable.reduce((sum, value) => sum + value, 0) / usable.length, 0, 1);
}

function buildLikert(score: number) {
  if (score >= 0.9) return 'strongly aligned';
  if (score >= 0.75) return 'mostly aligned';
  if (score >= 0.6) return 'partially aligned';
  if (score >= 0.4) return 'weak';
  return 'failed';
}

function isHostedModelId(modelId: string) {
  return modelId.includes('/');
}

function orderedByPreference(models: OvershootModel[], preference: string[]) {
  const readyById = new Map(models.map((model) => [model.id, model]));
  const ordered = preference
    .map((id) => readyById.get(id))
    .filter((model): model is OvershootModel => Boolean(model));
  const preferredIds = new Set(ordered.map((model) => model.id));
  return [
    ...ordered,
    ...models.filter((model) => !preferredIds.has(model.id)),
  ];
}

export function selectOvershootModelCandidates(
  models: OvershootModel[],
  preference: string[] = OVERSHOOT_MODEL_PREFERENCE,
): string[] {
  const ready = models.filter((model) => model.status === 'ready');
  const hosted = ready.filter((model) => isHostedModelId(model.id));
  const proprietary = ready.filter((model) => !isHostedModelId(model.id));
  return [
    ...orderedByPreference(hosted, preference),
    ...proprietary,
  ].map((model) => model.id);
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.unshift(fenced[1].trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const record = asRecord(parsed);
      if (Object.keys(record).length > 0) {
        return record;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error('Overshoot returned non-JSON content');
}

function normalizeDraftImprovement(value: unknown): AuraDraftImprovement | null {
  const record = asRecord(value);
  const rawType = asString(record.type);
  const allowedTypes = new Set<AuraImprovementType>([
    'rewrite_prompt_for_specificity',
    'inject_prior_scene_refs',
    'increase_identity_conditioning',
    'rewrite_camera_instructions',
    'swap_style_reference_board',
    'manual_review_required',
  ]);
  const type = rawType && allowedTypes.has(rawType as AuraImprovementType)
    ? (rawType as AuraImprovementType)
    : 'manual_review_required';
  const title = asString(record.title) ?? type.replace(/_/g, ' ');
  const rationale = asString(record.rationale) ?? asString(record.reason) ?? 'Overshoot flagged this as a draft-only improvement.';

  return {
    type,
    title,
    rationale,
    ...(asString(record.draftPrompt ?? record.draft_prompt) && {
      draftPrompt: asString(record.draftPrompt ?? record.draft_prompt),
    }),
    ...(asString(record.target) && { target: asString(record.target) }),
  };
}

export function normalizeAuraJudgeResponse(value: unknown): AuraJudgeResponse {
  const record = asRecord(value);
  const rawScores = asRecord(record.scores);
  const overall = normalizeScore100(rawScores.overall ?? record.overallScore ?? record.overall_score);
  if (overall === undefined) {
    throw new Error('Overshoot judgment is missing scores.overall');
  }

  const technical = normalizeScore100(rawScores.technical ?? record.technical);
  const aesthetic = normalizeScore100(rawScores.aesthetic ?? record.aesthetic);
  const safety = normalizeScore100(rawScores.safety ?? record.safety);

  const rawDraftImprovements = record.draftImprovements ?? record.draft_improvements;
  const draftImprovements = Array.isArray(rawDraftImprovements)
    ? rawDraftImprovements
        .map((entry) => normalizeDraftImprovement(entry))
        .filter((entry): entry is AuraDraftImprovement => Boolean(entry))
    : undefined;

  return {
    scores: {
      overall,
      ...(technical !== undefined && { technical }),
      ...(aesthetic !== undefined && { aesthetic }),
      ...(safety !== undefined && { safety }),
    },
    ...(normalizeScore100(record.promptAdherence ?? record.prompt_adherence) !== undefined && {
      promptAdherence: normalizeScore100(record.promptAdherence ?? record.prompt_adherence),
    }),
    ...(normalizeScore100(record.characterConsistency ?? record.character_consistency) !== undefined && {
      characterConsistency: normalizeScore100(record.characterConsistency ?? record.character_consistency),
    }),
    ...(normalizeScore100(record.spatialConsistency ?? record.spatial_consistency) !== undefined && {
      spatialConsistency: normalizeScore100(record.spatialConsistency ?? record.spatial_consistency),
    }),
    ...(normalizeScore100(record.temporalConsistency ?? record.temporal_consistency) !== undefined && {
      temporalConsistency: normalizeScore100(record.temporalConsistency ?? record.temporal_consistency),
    }),
    ...(normalizeScore100(record.continuity) !== undefined && {
      continuity: normalizeScore100(record.continuity),
    }),
    feedback: asString(record.feedback) ?? 'No feedback provided',
    tags: asStringArray(record.tags),
    suggestions: asStringArray(record.suggestions),
    ...(draftImprovements && { draftImprovements }),
    ...(Object.keys(asRecord(record.evidence)).length > 0 && { evidence: asRecord(record.evidence) }),
  };
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return { detail: text };
  }
}

function getCompletionText(responseJson: Record<string, unknown>): string {
  const choices = Array.isArray(responseJson.choices) ? responseJson.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => asString(asRecord(part).text))
      .filter((part): part is string => Boolean(part))
      .join('\n');
  }
  throw new Error('Overshoot completion response is missing message content');
}

function getErrorMessage(responseJson: Record<string, unknown>, fallback: string) {
  return asString(responseJson.detail) ?? asString(responseJson.error) ?? fallback;
}

export async function executeOvershootJsonCompletion(input: {
  apiKey: string;
  messages: OvershootChatMessage[];
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  modelPreference?: string[];
  maxTokens?: number;
  temperature?: number;
}): Promise<OvershootJsonCompletionResult> {
  if (!input.apiKey) {
    throw new Error('OVERSHOOT_API_KEY environment variable is not set');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.baseUrl ?? OVERSHOOT_BASE_URL;
  const modelsResponse = await fetchImpl(`${baseUrl}/models`);
  if (!modelsResponse.ok) {
    const details = await parseJsonResponse(modelsResponse);
    throw new Error(getErrorMessage(details, `Failed to list Overshoot models: ${modelsResponse.status}`));
  }

  const modelsJson = await parseJsonResponse(modelsResponse);
  const models = Array.isArray(modelsJson.data)
    ? modelsJson.data.map((entry) => {
        const record = asRecord(entry);
        return { id: asString(record.id) ?? '', status: asString(record.status) };
      }).filter((model) => model.id.length > 0)
    : [];
  const candidates = selectOvershootModelCandidates(models, input.modelPreference);
  if (candidates.length === 0) {
    throw new Error('No ready Overshoot models are available');
  }

  let lastError: Error | null = null;
  for (const model of candidates) {
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          response_format: { type: 'json_object' },
          max_tokens: input.maxTokens ?? 2200,
          temperature: input.temperature ?? 0.2,
        }),
      });

      const responseJson = await parseJsonResponse(response);
      if (!response.ok) {
        const message = getErrorMessage(responseJson, `Overshoot completion failed: ${response.status}`);
        const error = new Error(message);
        lastError = error;
        if (response.status === 503 || response.status === 429) {
          continue;
        }
        throw new OvershootNonRetryableError(message);
      }

      return {
        json: extractJsonObject(getCompletionText(responseJson)),
        modelUsed: asString(responseJson.model) ?? model,
        completionId: asString(responseJson.id),
        usage: asRecord(responseJson.usage) as OvershootUsage,
      };
    } catch (error) {
      if (error instanceof OvershootNonRetryableError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }

  throw lastError ?? new Error('Overshoot completion failed for every ready model');
}

export async function executeOvershootStreamAction(input: {
  apiKey: string;
  action: OvershootStreamAction;
  streamId?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): Promise<Record<string, unknown>> {
  if (!input.apiKey) {
    throw new Error('OVERSHOOT_API_KEY environment variable is not set');
  }

  if (input.action !== 'create' && !input.streamId) {
    throw new Error('streamId is required for this Overshoot stream action');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.baseUrl ?? OVERSHOOT_BASE_URL;
  const pathByAction: Record<OvershootStreamAction, string> = {
    create: '/streams',
    get: `/streams/${input.streamId}`,
    keepalive: `/streams/${input.streamId}/keepalive`,
    delete: `/streams/${input.streamId}`,
  };
  const methodByAction: Record<OvershootStreamAction, string> = {
    create: 'POST',
    get: 'GET',
    keepalive: 'POST',
    delete: 'DELETE',
  };

  const response = await fetchImpl(`${baseUrl}${pathByAction[input.action]}`, {
    method: methodByAction[input.action],
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
  });
  const responseJson = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(responseJson, `Overshoot stream ${input.action} failed: ${response.status}`));
  }

  return responseJson;
}

function buildFailureTags(judgeType: AuraEvaluationRow['judge_type'], score: number, tags: string[]) {
  const failureTags = score < 0.75 ? [judgeType] : [];
  return Array.from(new Set([...failureTags, ...tags.filter((tag) => /drift|artifact|inconsisten|unsafe|continuity|prompt/i.test(tag))]));
}

function buildReasons(response: AuraJudgeResponse, score: number) {
  const reasons = response.suggestions.length > 0 ? response.suggestions : [response.feedback];
  if (score >= 0.75) {
    return reasons.slice(0, 3);
  }
  return [`Score ${Math.round(score * 100)} is below the review threshold`, ...reasons].slice(0, 4);
}

export function buildAuraEvaluationRows(
  response: AuraJudgeResponse,
  context: {
    modelUsed: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
  },
): AuraEvaluationRow[] {
  const visualQuality = avg([
    scoreToUnit(response.scores.technical),
    scoreToUnit(response.scores.aesthetic),
    scoreToUnit(response.scores.overall),
  ]);
  const promptAdherence = scoreToUnit(response.promptAdherence ?? response.scores.overall);
  const characterConsistency = scoreToUnit(response.characterConsistency ?? response.scores.overall);
  const continuity = avg([
    scoreToUnit(response.continuity ?? response.scores.overall),
    scoreToUnit(response.spatialConsistency ?? response.scores.overall),
    scoreToUnit(response.temporalConsistency ?? response.scores.overall),
  ]);
  const canonCompliance = scoreToUnit(response.scores.safety ?? response.scores.overall);

  const baseEvidence = {
    provider: 'overshoot',
    model_used: context.modelUsed,
    media_url: context.mediaUrl,
    media_type: context.mediaType,
    tags: response.tags,
    suggestions: response.suggestions,
    draft_improvements: response.draftImprovements ?? [],
    ...(response.evidence ?? {}),
  };

  const rows: Array<{
    judge_type: AuraEvaluationRow['judge_type'];
    score: number;
    criteria_breakdown: Record<string, number>;
  }> = [
    {
      judge_type: 'visual_quality',
      score: visualQuality,
      criteria_breakdown: {
        overall: scoreToUnit(response.scores.overall),
        technical: scoreToUnit(response.scores.technical ?? response.scores.overall),
        aesthetic: scoreToUnit(response.scores.aesthetic ?? response.scores.overall),
      },
    },
    {
      judge_type: 'prompt_adherence',
      score: promptAdherence,
      criteria_breakdown: {
        prompt_adherence: promptAdherence,
      },
    },
    {
      judge_type: 'character_consistency',
      score: characterConsistency,
      criteria_breakdown: {
        character_consistency: characterConsistency,
      },
    },
    {
      judge_type: 'continuity',
      score: continuity,
      criteria_breakdown: {
        continuity: scoreToUnit(response.continuity ?? response.scores.overall),
        spatial_consistency: scoreToUnit(response.spatialConsistency ?? response.scores.overall),
        temporal_consistency: scoreToUnit(response.temporalConsistency ?? response.scores.overall),
      },
    },
    {
      judge_type: 'canon_compliance',
      score: canonCompliance,
      criteria_breakdown: {
        safety: canonCompliance,
      },
    },
  ];

  return rows.map((row) => ({
    judge_type: row.judge_type,
    judge_model: context.modelUsed,
    judge_model_version: 'overshoot-v1',
    score: row.score,
    confidence: 0.78,
    likert_label: buildLikert(row.score),
    failure_tags: buildFailureTags(row.judge_type, row.score, response.tags),
    reasons: buildReasons(response, row.score),
    evidence: baseEvidence,
    criteria_breakdown: row.criteria_breakdown,
  }));
}

export function aggregateAuraEvaluationRows(rows: AuraEvaluationRow[]) {
  const aggregates = Object.fromEntries(rows.map((row) => [row.judge_type, row.score]));
  return {
    aggregates,
    disagreement: Object.fromEntries(rows.map((row) => [row.judge_type, 0])),
    failureTags: Array.from(new Set(rows.flatMap((row) => row.failure_tags))),
  };
}
