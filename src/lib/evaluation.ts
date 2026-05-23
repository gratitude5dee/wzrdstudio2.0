import type { Json } from '@/integrations/supabase/types';

export type EvaluationMode = 'off' | 'shadow' | 'soft_gate' | 'hard_gate';

export type ReviewStatus = 'not_reviewed' | 'clear' | 'needs_review' | 'needs_revision';

export type JudgeType =
  | 'prompt_adherence'
  | 'visual_quality'
  | 'character_consistency'
  | 'continuity'
  | 'storyline'
  | 'canon_compliance';

export interface EvaluationThresholds {
  storyline: number;
  continuity: number;
  character_consistency: number;
  canon_compliance: number;
  max_disagreement: number;
}

export interface EvaluationSummary {
  latestRunId?: string | null;
  aggregates?: Partial<Record<JudgeType, number>>;
  disagreement?: Partial<Record<JudgeType, number>>;
  failureTags?: string[];
  status?: ReviewStatus;
  updatedAt?: string | null;
}

export interface CharacterIdentityProfile {
  face_refs?: string[];
  hairstyle_tags?: string[];
  wardrobe_tags?: string[];
  body_shape_tags?: string[];
  movement_tags?: string[];
  voice_tags?: string[];
  canon_facts?: string[];
}

export interface ShotPacket {
  story_goal?: string | null;
  visual_prompt?: string | null;
  camera_movement?: string | null;
  composition_notes?: string | null;
  continuity_refs?: string[];
  canon_constraints?: string[];
  style_bundle?: Record<string, unknown>;
  camera_bundle?: Record<string, unknown>;
}

export const DEFAULT_EVALUATION_THRESHOLDS: EvaluationThresholds = {
  storyline: 0.72,
  continuity: 0.8,
  character_consistency: 0.82,
  canon_compliance: 0.85,
  max_disagreement: 0.2,
};

export function isEvaluationThresholds(value: unknown): value is EvaluationThresholds {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof EvaluationThresholds, unknown>>;
  return (
    typeof candidate.storyline === 'number' &&
    typeof candidate.continuity === 'number' &&
    typeof candidate.character_consistency === 'number' &&
    typeof candidate.canon_compliance === 'number' &&
    typeof candidate.max_disagreement === 'number'
  );
}

export function normalizeEvaluationThresholds(value: unknown): EvaluationThresholds {
  if (!value || typeof value !== 'object') {
    return DEFAULT_EVALUATION_THRESHOLDS;
  }

  const candidate = value as Partial<Record<keyof EvaluationThresholds, unknown>>;
  return {
    storyline:
      typeof candidate.storyline === 'number'
        ? candidate.storyline
        : DEFAULT_EVALUATION_THRESHOLDS.storyline,
    continuity:
      typeof candidate.continuity === 'number'
        ? candidate.continuity
        : DEFAULT_EVALUATION_THRESHOLDS.continuity,
    character_consistency:
      typeof candidate.character_consistency === 'number'
        ? candidate.character_consistency
        : DEFAULT_EVALUATION_THRESHOLDS.character_consistency,
    canon_compliance:
      typeof candidate.canon_compliance === 'number'
        ? candidate.canon_compliance
        : DEFAULT_EVALUATION_THRESHOLDS.canon_compliance,
    max_disagreement:
      typeof candidate.max_disagreement === 'number'
        ? candidate.max_disagreement
        : DEFAULT_EVALUATION_THRESHOLDS.max_disagreement,
  };
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function parseEvaluationSummary(value: Json | null | undefined): EvaluationSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const summary = value as Record<string, unknown>;
  return {
    latestRunId: typeof summary.latestRunId === 'string' ? summary.latestRunId : null,
    aggregates:
      summary.aggregates && typeof summary.aggregates === 'object' && !Array.isArray(summary.aggregates)
        ? (summary.aggregates as Partial<Record<JudgeType, number>>)
        : undefined,
    disagreement:
      summary.disagreement && typeof summary.disagreement === 'object' && !Array.isArray(summary.disagreement)
        ? (summary.disagreement as Partial<Record<JudgeType, number>>)
        : undefined,
    failureTags: normalizeStringArray(summary.failureTags),
    status: typeof summary.status === 'string' ? (summary.status as ReviewStatus) : undefined,
    updatedAt: typeof summary.updatedAt === 'string' ? summary.updatedAt : null,
  };
}
