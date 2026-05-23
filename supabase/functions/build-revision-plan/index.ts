import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { createGenerationJob, updateGenerationJob } from '../_shared/observability.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

function isInternalRequest(req: Request) {
  const apiKey = req.headers.get('apikey');
  return !!apiKey && apiKey === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

async function requireAuth(req: Request) {
  if (isInternalRequest(req)) {
    return { ok: true, userId: null as string | null };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, userId: null as string | null };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);
  return { ok: !!data.user && !error, userId: data.user?.id ?? null };
}

function buildActions(failedJudges: string[], rejectionTags: string[]) {
  const actions: Array<Record<string, unknown>> = [];

  if (failedJudges.includes('storyline')) {
    actions.push({ type: 'rebuild_scene_from_narrative_atoms' });
  }
  if (failedJudges.includes('continuity')) {
    actions.push({ type: 'inject_prior_scene_refs' });
  }
  if (failedJudges.includes('character_consistency')) {
    actions.push({ type: 'lock_character_identity_profile' });
  }
  if (failedJudges.includes('prompt_adherence')) {
    actions.push({ type: 'rewrite_prompt_for_specificity' });
  }
  if (failedJudges.includes('canon_compliance')) {
    actions.push({ type: 'enforce_canon_constraints' });
  }
  if (rejectionTags.includes('wrong_mood')) {
    actions.push({ type: 'swap_style_reference_board' });
  }
  if (rejectionTags.includes('identity_drift')) {
    actions.push({ type: 'increase_identity_conditioning' });
  }
  if (rejectionTags.includes('camera_unmotivated')) {
    actions.push({ type: 'rewrite_camera_instructions' });
  }

  if (actions.length === 0) {
    actions.push({ type: 'manual_review_required' });
  }

  return actions;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return errorResponse('Unauthorized', 401);
  }

  let revisionJobId: string | null = null;
  try {
    const {
      project_id,
      target_type,
      target_id,
      source_run_id,
      review_task_id,
      rejection_reason_codes = [],
      note = null,
    } = await req.json();

    if (!project_id || !target_type || !target_id) {
      return errorResponse('project_id, target_type, and target_id are required', 400);
    }

    let actorUserId = auth.userId;
    if (!actorUserId) {
      const { data: projectOwner } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', project_id)
        .maybeSingle();
      actorUserId = projectOwner?.user_id ?? null;
    }

    revisionJobId = actorUserId
      ? await createGenerationJob(supabase, {
          userId: actorUserId,
          projectId: project_id,
          jobType: 'revision',
          modelId: 'shadow-revision-planner',
          status: 'running',
          config: {
            target_type,
            target_id,
            review_task_id: review_task_id ?? null,
          },
        })
      : null;

    let runId = source_run_id as string | null;
    if (!runId && review_task_id) {
      const { data: reviewTask } = await supabase
        .from('review_tasks')
        .select('source_run_id')
        .eq('id', review_task_id)
        .maybeSingle();
      runId = reviewTask?.source_run_id ?? null;
    }

    const { data: evalResults } = runId
      ? await supabase
          .from('evaluation_results')
          .select('judge_type, score')
          .eq('run_id', runId)
      : { data: [] as Array<{ judge_type: string | null; score: number | null }> };

    const failedJudges = Array.from(
      new Set(
        (evalResults ?? [])
          .filter((result) => typeof result.score === 'number' && result.score < 0.75)
          .map((result) => result.judge_type)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      )
    );

    const actions = buildActions(failedJudges, rejection_reason_codes);

    const { data: revisionPlan, error } = await supabase
      .from('revision_plans')
      .insert({
        project_id,
        target_type,
        target_id,
        source_run_id: runId,
        trigger: {
          failed_judges: failedJudges,
          rejection_reason_codes,
          review_task_id: review_task_id ?? null,
          note,
        },
        actions,
        status: 'proposed',
      })
      .select('*')
      .single();

    if (error || !revisionPlan) {
      throw new Error(error?.message || 'Failed to create revision plan');
    }

    if (target_type !== 'character') {
      const table = target_type === 'storyline' ? 'storylines' : `${target_type}s`;
      await supabase
        .from(table)
        .update({ review_status: 'needs_revision' })
        .eq('id', target_id);
    }

    await updateGenerationJob(supabase, revisionJobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      result_payload: {
        revision_plan_id: revisionPlan.id,
        actions,
      },
    });

    return successResponse({
      success: true,
      revision_plan_id: revisionPlan.id,
      actions,
    });
  } catch (error) {
    console.error('[build-revision-plan] error', error);
    await updateGenerationJob(supabase, revisionJobId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Failed to build revision plan',
      completed_at: new Date().toISOString(),
    });
    return errorResponse(error instanceof Error ? error.message : 'Failed to build revision plan', 500);
  }
});
