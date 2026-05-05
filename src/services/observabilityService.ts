import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import {
  DEFAULT_EVALUATION_THRESHOLDS,
  normalizeEvaluationThresholds,
  parseEvaluationSummary,
  type EvaluationThresholds,
} from '@/lib/evaluation';

type Tables = Database['public']['Tables'];

export type EvaluationRunRow = Tables['evaluation_runs']['Row'];
export type EvaluationResultRow = Tables['evaluation_results']['Row'];
export type ReviewTaskRow = Tables['review_tasks']['Row'];
export type ReviewEventRow = Tables['review_events']['Row'];
export type RevisionPlanRow = Tables['revision_plans']['Row'];
export type PromptVersionRow = Tables['prompt_versions']['Row'];
export type AssetLineageRow = Tables['asset_lineage']['Row'];
export type NarrativeAtomRow = Tables['narrative_atoms']['Row'];
export type StoryEventRow = Tables['story_events']['Row'];
export type GenerationJobRow = Tables['generation_jobs']['Row'];
export type AuraJudgeMode = 'quality' | 'safety' | 'aesthetic' | 'full';
export type AuraJudgeTargetType = 'project' | 'storyline' | 'scene' | 'shot' | 'character';

export interface AuraDraftImprovement {
  type:
    | 'rewrite_prompt_for_specificity'
    | 'inject_prior_scene_refs'
    | 'increase_identity_conditioning'
    | 'rewrite_camera_instructions'
    | 'swap_style_reference_board'
    | 'manual_review_required';
  title: string;
  rationale: string;
  draftPrompt?: string;
  target?: string;
}

export interface AuraJudgeInput {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  mode: AuraJudgeMode;
  criteria?: string;
  projectId?: string;
  targetType?: AuraJudgeTargetType;
  targetId?: string;
  promptText?: string;
  referenceUrls?: string[];
  persist?: boolean;
}

export interface AuraJudgeResult {
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  runId?: string;
}

export interface ObservabilityOverview {
  openReviewTasks: number;
  pendingRevisions: number;
  completedEvaluations: number;
  activeEvaluationJobs: number;
  needsAttentionShots: number;
  needsAttentionScenes: number;
  failedJudgeFamilies: string[];
}

export interface ProjectObservabilityData {
  projectTitle: string;
  thresholds: EvaluationThresholds;
  overview: ObservabilityOverview;
  generationJobs: GenerationJobRow[];
  evaluationRuns: EvaluationRunRow[];
  evaluationResultsByRun: Record<string, EvaluationResultRow[]>;
  reviewTasks: ReviewTaskRow[];
  reviewEvents: ReviewEventRow[];
  revisionPlans: RevisionPlanRow[];
  promptVersions: PromptVersionRow[];
  assetLineage: AssetLineageRow[];
  narrativeAtoms: NarrativeAtomRow[];
  storyEvents: StoryEventRow[];
}

const EMPTY_DATA: ProjectObservabilityData = {
  projectTitle: 'Untitled Project',
  thresholds: DEFAULT_EVALUATION_THRESHOLDS,
  overview: {
    openReviewTasks: 0,
    pendingRevisions: 0,
    completedEvaluations: 0,
    activeEvaluationJobs: 0,
    needsAttentionShots: 0,
    needsAttentionScenes: 0,
    failedJudgeFamilies: [],
  },
  generationJobs: [],
  evaluationRuns: [],
  evaluationResultsByRun: {},
  reviewTasks: [],
  reviewEvents: [],
  revisionPlans: [],
  promptVersions: [],
  assetLineage: [],
  narrativeAtoms: [],
  storyEvents: [],
};

function getJsonObject(value: Json | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function collectFailedJudgeFamilies(runs: EvaluationRunRow[], thresholds: EvaluationThresholds) {
  const failed = new Set<string>();

  for (const run of runs) {
    const aggregates = getJsonObject(run.aggregates);
    const disagreement = getJsonObject(run.disagreement);

    if (typeof aggregates.storyline === 'number' && aggregates.storyline < thresholds.storyline) {
      failed.add('storyline');
    }
    if (typeof aggregates.continuity === 'number' && aggregates.continuity < thresholds.continuity) {
      failed.add('continuity');
    }
    if (
      typeof aggregates.character_consistency === 'number' &&
      aggregates.character_consistency < thresholds.character_consistency
    ) {
      failed.add('character_consistency');
    }
    if (
      typeof aggregates.canon_compliance === 'number' &&
      aggregates.canon_compliance < thresholds.canon_compliance
    ) {
      failed.add('canon_compliance');
    }

    for (const [judgeType, value] of Object.entries(disagreement)) {
      if (typeof value === 'number' && value > thresholds.max_disagreement) {
        failed.add(`${judgeType}_disagreement`);
      }
    }
  }

  return Array.from(failed);
}

async function fetchEvaluationResults(runIds: string[]) {
  if (runIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('evaluation_results')
    .select('*')
    .in('run_id', runIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).reduce<Record<string, EvaluationResultRow[]>>((acc, row) => {
    acc[row.run_id] ??= [];
    acc[row.run_id].push(row);
    return acc;
  }, {});
}

export const observabilityService = {
  async getProjectObservability(projectId: string): Promise<ProjectObservabilityData> {
    const [
      projectResult,
      settingsResult,
      generationJobsResult,
      evaluationRunsResult,
      reviewTasksResult,
      reviewEventsResult,
      revisionPlansResult,
      promptVersionsResult,
      assetLineageResult,
      narrativeAtomsResult,
      storyEventsResult,
      shotsResult,
      scenesResult,
    ] = await Promise.all([
      supabase.from('projects').select('title').eq('id', projectId).maybeSingle(),
      supabase
        .from('project_settings')
        .select('evaluation_thresholds')
        .eq('project_id', projectId)
        .maybeSingle(),
      supabase
        .from('generation_jobs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('evaluation_runs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('review_tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('review_events')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('revision_plans')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('prompt_versions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('asset_lineage')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('narrative_atoms')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
      supabase
        .from('story_events')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
      supabase.from('shots').select('id, review_status, evaluation_summary').eq('project_id', projectId),
      supabase.from('scenes').select('id, review_status, evaluation_summary').eq('project_id', projectId),
    ]);

    for (const result of [
      projectResult,
      settingsResult,
      generationJobsResult,
      evaluationRunsResult,
      reviewTasksResult,
      reviewEventsResult,
      revisionPlansResult,
      promptVersionsResult,
      assetLineageResult,
      narrativeAtomsResult,
      storyEventsResult,
      shotsResult,
      scenesResult,
    ]) {
      if (result.error) {
        throw result.error;
      }
    }

    const evaluationRuns = (evaluationRunsResult.data ?? []) as EvaluationRunRow[];
    const evaluationResultsByRun = await fetchEvaluationResults(evaluationRuns.map((run) => run.id));
    const thresholds = normalizeEvaluationThresholds(settingsResult.data?.evaluation_thresholds);
    const failedJudgeFamilies = collectFailedJudgeFamilies(evaluationRuns, thresholds);

    const reviewTasks = (reviewTasksResult.data ?? []) as ReviewTaskRow[];
    const revisionPlans = (revisionPlansResult.data ?? []) as RevisionPlanRow[];
    const generationJobs = (generationJobsResult.data ?? []) as GenerationJobRow[];
    const shots = (shotsResult.data ?? []) as Array<{ review_status: string | null; evaluation_summary: Json | null }>;
    const scenes = (scenesResult.data ?? []) as Array<{ review_status: string | null; evaluation_summary: Json | null }>;

    return {
      ...EMPTY_DATA,
      projectTitle: projectResult.data?.title ?? EMPTY_DATA.projectTitle,
      thresholds,
      overview: {
        openReviewTasks: reviewTasks.filter((task) => task.status === 'open' || task.status === 'in_review').length,
        pendingRevisions: revisionPlans.filter(
          (plan) => plan.status === 'proposed' || plan.status === 'approved'
        ).length,
        completedEvaluations: evaluationRuns.filter((run) => run.status === 'completed').length,
        activeEvaluationJobs: generationJobs.filter(
          (job) =>
            (job.job_type === 'evaluation' || job.job_type === 'revision') &&
            (job.status === 'queued' || job.status === 'running' || job.status === 'processing')
        ).length,
        needsAttentionShots: shots.filter(
          (shot) => shot.review_status === 'needs_review' || shot.review_status === 'needs_revision'
        ).length,
        needsAttentionScenes: scenes.filter(
          (scene) => scene.review_status === 'needs_review' || scene.review_status === 'needs_revision'
        ).length,
        failedJudgeFamilies,
      },
      generationJobs,
      evaluationRuns,
      evaluationResultsByRun,
      reviewTasks,
      reviewEvents: (reviewEventsResult.data ?? []) as ReviewEventRow[],
      revisionPlans,
      promptVersions: (promptVersionsResult.data ?? []) as PromptVersionRow[],
      assetLineage: (assetLineageResult.data ?? []) as AssetLineageRow[],
      narrativeAtoms: (narrativeAtomsResult.data ?? []) as NarrativeAtomRow[],
      storyEvents: (storyEventsResult.data ?? []) as StoryEventRow[],
    };
  },

  async submitReviewEvent(input: {
    projectId: string;
    reviewTaskId: string;
    targetType: 'storyline' | 'scene' | 'shot' | 'character';
    targetId: string;
    feedbackType: 'approve' | 'reject' | 'annotate';
    note?: string;
    rejectionReasonCodes?: string[];
  }) {
    const rejectionCodes = input.rejectionReasonCodes ?? [];

    const { data: event, error: eventError } = await supabase
      .from('review_events')
      .insert({
        project_id: input.projectId,
        review_task_id: input.reviewTaskId,
        target_type: input.targetType,
        target_id: input.targetId,
        feedback_type: input.feedbackType,
        rejection_reason_codes: rejectionCodes,
        note: input.note ?? null,
      })
      .select('*')
      .single();

    if (eventError) {
      throw eventError;
    }

    const nextStatus =
      input.feedbackType === 'annotate'
        ? 'in_review'
        : input.feedbackType === 'approve'
          ? 'resolved'
          : 'resolved';

    const { error: taskError } = await supabase
      .from('review_tasks')
      .update({
        status: nextStatus,
        resolved_at: input.feedbackType === 'annotate' ? null : new Date().toISOString(),
      })
      .eq('id', input.reviewTaskId);

    if (taskError) {
      throw taskError;
    }

    if (input.targetType !== 'character') {
      const tableName = input.targetType === 'storyline' ? 'storylines' : `${input.targetType}s`;
      const reviewStatus = input.feedbackType === 'approve' ? 'clear' : 'needs_revision';
      const { error: statusError } = await supabase
        .from(tableName as 'storylines' | 'scenes' | 'shots')
        .update({ review_status: reviewStatus })
        .eq('id', input.targetId);

      if (statusError) {
        throw statusError;
      }
    }

    if (input.feedbackType === 'reject') {
      await supabase.functions.invoke('build-revision-plan', {
        body: {
          project_id: input.projectId,
          target_type: input.targetType,
          target_id: input.targetId,
          review_task_id: input.reviewTaskId,
          rejection_reason_codes: rejectionCodes,
          note: input.note ?? null,
        },
      });
    }

    return event;
  },

  async evaluateMediaWithAuraJudge(input: AuraJudgeInput): Promise<AuraJudgeResult> {
    const { data, error } = await supabase.functions.invoke('aura-vlm-judge', {
      body: {
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        mode: input.mode,
        criteria: input.criteria?.trim() || undefined,
        projectId: input.projectId,
        targetType: input.targetType,
        targetId: input.targetId,
        promptText: input.promptText?.trim() || undefined,
        referenceUrls: input.referenceUrls?.filter((url) => url.trim().length > 0),
        persist: input.persist,
      },
    });

    if (error) {
      throw error;
    }

    const payload = (data as { data?: AuraJudgeResult } | null)?.data;
    if (!payload?.scores || typeof payload.scores.overall !== 'number') {
      throw new Error('Aura judge returned an invalid response.');
    }

    return payload;
  },

  parseEvaluationSummary,
};
