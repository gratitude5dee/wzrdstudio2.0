import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import {
  DEFAULT_EVALUATION_THRESHOLDS,
  SHADOW_RELIABILITY,
  SHADOW_RUBRIC_VERSION,
  buildEvaluationSummary,
  fetchProjectEvaluationConfig,
  updateEvaluationSummary,
  updateGenerationJob,
} from '../_shared/observability.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

type TargetType = 'storyline' | 'scene' | 'shot' | 'character';
type JudgeType =
  | 'prompt_adherence'
  | 'visual_quality'
  | 'character_consistency'
  | 'continuity'
  | 'storyline'
  | 'canon_compliance';

interface JudgeResult {
  judge_type: JudgeType;
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

const JUDGE_TYPES: JudgeType[] = [
  'prompt_adherence',
  'visual_quality',
  'character_consistency',
  'continuity',
  'storyline',
  'canon_compliance',
];

const RUBRICS: Record<TargetType, Record<JudgeType, string[]>> = {
  storyline: {
    prompt_adherence: ['title present', 'description present', 'full story present'],
    visual_quality: ['scene coverage', 'shot coverage', 'asset readiness'],
    character_consistency: ['character profiles', 'anchor coverage', 'consistency summaries'],
    continuity: ['scene ordering', 'story events', 'cross-scene context'],
    storyline: ['narrative atoms', 'story events', 'scene goals'],
    canon_compliance: ['canon facts stored', 'creative constraints stored', 'selected storyline'],
  },
  scene: {
    prompt_adherence: ['scene goal', 'scene description', 'shot prompts'],
    visual_quality: ['shot readiness', 'image coverage', 'video coverage'],
    character_consistency: ['character profiles', 'identity references', 'continuity refs'],
    continuity: ['location continuity', 'lighting continuity', 'story events'],
    storyline: ['narrative atoms', 'story goal', 'shot sequence'],
    canon_compliance: ['canon facts', 'creative constraints', 'scene metadata'],
  },
  shot: {
    prompt_adherence: ['prompt idea', 'visual prompt', 'shot packet'],
    visual_quality: ['image asset', 'video asset', 'generation completion'],
    character_consistency: ['identity profile', 'anchor refs', 'continuity refs'],
    continuity: ['scene context', 'shot packet continuity', 'story goal'],
    storyline: ['story goal', 'shot role', 'scene relation'],
    canon_compliance: ['canon facts', 'creative constraints', 'shot packet'],
  },
  character: {
    prompt_adherence: ['name', 'description', 'identity profile'],
    visual_quality: ['image available', 'consistency summary', 'anchor refs'],
    character_consistency: ['face refs', 'wardrobe tags', 'movement tags'],
    continuity: ['canon facts', 'story appearances', 'project context'],
    storyline: ['participant in story events', 'scene appearances', 'role clarity'],
    canon_compliance: ['canon facts', 'identity profile', 'constraints'],
  },
};

function isInternalRequest(req: Request) {
  const apiKey = req.headers.get('apikey');
  return !!apiKey && apiKey === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

async function requireAuth(req: Request) {
  if (isInternalRequest(req)) {
    return true;
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);
  return !!data.user && !error;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const ratio = (passing: number, total: number) => (total <= 0 ? 0 : clamp(passing / total));

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function completionScore(status: string | null | undefined, url?: string | null) {
  if (status === 'completed' && url) return 1;
  if (status === 'generating' || status === 'running') return 0.5;
  if (status === 'prompt_ready' || status === 'queued') return 0.35;
  return 0;
}

function buildLikert(score: number) {
  if (score >= 0.9) return 'strongly aligned';
  if (score >= 0.75) return 'mostly aligned';
  if (score >= 0.6) return 'partially aligned';
  if (score >= 0.4) return 'weak';
  return 'failed';
}

async function getPacket(targetType: TargetType, targetId: string, projectId: string) {
  if (targetType === 'storyline') {
    const [{ data: storyline }, { data: scenes }, { data: characters }, { data: atoms }, { data: events }] = await Promise.all([
      supabase.from('storylines').select('*').eq('id', targetId).maybeSingle(),
      supabase.from('scenes').select('*').eq('storyline_id', targetId).order('scene_number'),
      supabase.from('characters').select('*').eq('project_id', projectId),
      supabase.from('narrative_atoms').select('*').eq('storyline_id', targetId),
      supabase.from('story_events').select('*').eq('storyline_id', targetId),
    ]);

    return { storyline, scenes: scenes ?? [], characters: characters ?? [], atoms: atoms ?? [], events: events ?? [] };
  }

  if (targetType === 'scene') {
    const { data: scene } = await supabase.from('scenes').select('*').eq('id', targetId).maybeSingle();
    const [{ data: shots }, { data: atoms }, { data: events }, { data: characters }] = await Promise.all([
      supabase.from('shots').select('*').eq('scene_id', targetId).order('shot_number'),
      supabase.from('narrative_atoms').select('*').eq('scene_id', targetId),
      supabase.from('story_events').select('*').eq('scene_id', targetId),
      supabase.from('characters').select('*').eq('project_id', projectId),
    ]);

    return { scene, shots: shots ?? [], atoms: atoms ?? [], events: events ?? [], characters: characters ?? [] };
  }

  if (targetType === 'shot') {
    const { data: shot } = await supabase.from('shots').select('*').eq('id', targetId).maybeSingle();
    const sceneId = shot?.scene_id;
    const [{ data: scene }, { data: characters }] = await Promise.all([
      sceneId ? supabase.from('scenes').select('*').eq('id', sceneId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('characters').select('*').eq('project_id', projectId),
    ]);

    return { shot, scene, characters: characters ?? [] };
  }

  const [{ data: character }, { data: events }] = await Promise.all([
    supabase.from('characters').select('*').eq('id', targetId).maybeSingle(),
    supabase.from('story_events').select('*').eq('project_id', projectId),
  ]);

  return { character, events: events ?? [] };
}

function scoreJudge(targetType: TargetType, packet: Record<string, any>, judgeType: JudgeType, judgeModel: string, config: { canonFacts: string[]; creativeConstraints: string[] }) {
  const reasons: string[] = [];
  const failureTags: string[] = [];
  let criteriaBreakdown: Record<string, number> = {};

  if (targetType === 'storyline') {
    const scenes = packet.scenes as any[];
    const characters = packet.characters as any[];
    const atoms = packet.atoms as any[];
    const events = packet.events as any[];
    const storyline = packet.storyline;

    switch (judgeType) {
      case 'prompt_adherence':
        criteriaBreakdown = {
          title_present: storyline?.title ? 1 : 0,
          description_present: storyline?.description ? 1 : 0,
          full_story_present: storyline?.full_story ? 1 : 0,
        };
        break;
      case 'visual_quality':
        criteriaBreakdown = {
          scene_coverage: ratio(scenes.length, Math.max(scenes.length, 1)),
          shot_coverage: ratio(scenes.filter((scene) => !!scene.description).length, Math.max(scenes.length, 1)),
          asset_readiness: avg(scenes.map((scene) => (scene.review_status === 'clear' ? 1 : 0.5))),
        };
        break;
      case 'character_consistency':
        criteriaBreakdown = {
          character_profiles: ratio(characters.filter((character) => character.identity_profile).length, Math.max(characters.length, 1)),
          anchor_coverage: ratio(characters.filter((character) => (character.anchor_asset_ids ?? []).length > 0).length, Math.max(characters.length, 1)),
          consistency_summaries: ratio(characters.filter((character) => character.consistency_summary).length, Math.max(characters.length, 1)),
        };
        break;
      case 'continuity':
        criteriaBreakdown = {
          scene_ordering: scenes.length > 0 ? 1 : 0,
          story_events: ratio(events.length, Math.max(scenes.length, 1)),
          cross_scene_context: ratio(atoms.length, Math.max(scenes.length * 2, 1)),
        };
        break;
      case 'storyline':
        criteriaBreakdown = {
          narrative_atoms: ratio(atoms.length, Math.max(scenes.length * 2, 1)),
          story_events: ratio(events.length, Math.max(scenes.length, 1)),
          scene_goals: ratio(scenes.filter((scene) => !!scene.story_goal).length, Math.max(scenes.length, 1)),
        };
        break;
      case 'canon_compliance':
        criteriaBreakdown = {
          canon_facts_present: config.canonFacts.length > 0 ? 1 : 0.8,
          creative_constraints_present: config.creativeConstraints.length > 0 ? 1 : 0.8,
          selected_storyline: storyline?.is_selected ? 1 : 0.75,
        };
        break;
    }
  } else if (targetType === 'scene') {
    const shots = packet.shots as any[];
    const scene = packet.scene;
    const atoms = packet.atoms as any[];
    const events = packet.events as any[];
    const characters = packet.characters as any[];

    switch (judgeType) {
      case 'prompt_adherence':
        criteriaBreakdown = {
          scene_goal: scene?.story_goal ? 1 : 0,
          scene_description: scene?.description ? 1 : 0,
          shot_prompts: ratio(shots.filter((shot) => !!shot.prompt_idea && !!shot.visual_prompt).length, Math.max(shots.length, 1)),
        };
        break;
      case 'visual_quality':
        criteriaBreakdown = {
          shot_readiness: ratio(shots.filter((shot) => shot.image_status === 'completed').length, Math.max(shots.length, 1)),
          image_coverage: avg(shots.map((shot) => completionScore(shot.image_status, shot.image_url))),
          video_coverage: avg(shots.map((shot) => completionScore(shot.video_status, shot.video_url))),
        };
        break;
      case 'character_consistency':
        criteriaBreakdown = {
          character_profiles: ratio(characters.filter((character) => character.identity_profile).length, Math.max(characters.length, 1)),
          identity_refs: ratio(shots.filter((shot) => shot.shot_packet && typeof shot.shot_packet === 'object').length, Math.max(shots.length, 1)),
          continuity_refs: ratio(shots.filter((shot) => shot.shot_packet?.continuity_refs?.length).length, Math.max(shots.length, 1)),
        };
        break;
      case 'continuity':
        criteriaBreakdown = {
          location_continuity: scene?.location ? 1 : 0,
          lighting_continuity: scene?.lighting ? 1 : 0,
          story_events: ratio(events.length, Math.max(atoms.length, 1)),
        };
        break;
      case 'storyline':
        criteriaBreakdown = {
          narrative_atoms: ratio(atoms.length, 2),
          story_goal: scene?.story_goal ? 1 : 0,
          shot_sequence: ratio(shots.length, Math.max(shots.length, 1)),
        };
        break;
      case 'canon_compliance':
        criteriaBreakdown = {
          canon_facts_present: config.canonFacts.length > 0 ? 1 : 0.8,
          creative_constraints_present: config.creativeConstraints.length > 0 ? 1 : 0.8,
          scene_metadata: avg([scene?.location ? 1 : 0, scene?.lighting ? 1 : 0, scene?.weather ? 1 : 0]),
        };
        break;
    }
  } else if (targetType === 'shot') {
    const shot = packet.shot;
    const scene = packet.scene;
    const characters = packet.characters as any[];
    switch (judgeType) {
      case 'prompt_adherence':
        criteriaBreakdown = {
          prompt_idea: shot?.prompt_idea ? 1 : 0,
          visual_prompt: shot?.visual_prompt ? 1 : 0,
          shot_packet: shot?.shot_packet ? 1 : 0,
        };
        break;
      case 'visual_quality':
        criteriaBreakdown = {
          image_ready: completionScore(shot?.image_status, shot?.image_url),
          video_ready: completionScore(shot?.video_status, shot?.video_url),
          no_failure: shot?.failure_reason ? 0 : 1,
        };
        break;
      case 'character_consistency':
        criteriaBreakdown = {
          character_profiles: ratio(characters.filter((character) => character.identity_profile).length, Math.max(characters.length, 1)),
          anchor_refs: ratio(characters.filter((character) => (character.anchor_asset_ids ?? []).length > 0).length, Math.max(characters.length, 1)),
          continuity_refs: shot?.shot_packet?.continuity_refs?.length ? 1 : 0,
        };
        break;
      case 'continuity':
        criteriaBreakdown = {
          scene_context: scene?.id ? 1 : 0,
          continuity_refs: shot?.shot_packet?.continuity_refs?.length ? 1 : 0,
          story_goal: scene?.story_goal || shot?.shot_packet?.story_goal ? 1 : 0,
        };
        break;
      case 'storyline':
        criteriaBreakdown = {
          story_goal: shot?.shot_packet?.story_goal || scene?.story_goal ? 1 : 0,
          shot_role: shot?.prompt_idea ? 1 : 0,
          scene_relation: scene?.description ? 1 : 0,
        };
        break;
      case 'canon_compliance':
        criteriaBreakdown = {
          canon_facts_present: config.canonFacts.length > 0 ? 1 : 0.8,
          creative_constraints_present: config.creativeConstraints.length > 0 ? 1 : 0.8,
          packet_present: shot?.shot_packet ? 1 : 0.75,
        };
        break;
    }
  } else {
    const character = packet.character;
    const events = packet.events as any[];
    switch (judgeType) {
      case 'prompt_adherence':
        criteriaBreakdown = {
          name: character?.name ? 1 : 0,
          description: character?.description ? 1 : 0,
          identity_profile: character?.identity_profile ? 1 : 0,
        };
        break;
      case 'visual_quality':
        criteriaBreakdown = {
          image_available: character?.image_url ? 1 : 0,
          consistency_summary: character?.consistency_summary ? 1 : 0,
          anchor_refs: (character?.anchor_asset_ids ?? []).length > 0 ? 1 : 0,
        };
        break;
      case 'character_consistency':
        criteriaBreakdown = {
          face_refs: ratio(character?.identity_profile?.face_refs?.length ?? 0, 1),
          wardrobe_tags: ratio(character?.identity_profile?.wardrobe_tags?.length ?? 0, 1),
          movement_tags: ratio(character?.identity_profile?.movement_tags?.length ?? 0, 1),
        };
        break;
      case 'continuity':
        criteriaBreakdown = {
          canon_facts_present: config.canonFacts.length > 0 ? 1 : 0.8,
          story_appearances: ratio(events.filter((event) => (event.participants ?? []).includes(character?.name)).length, Math.max(events.length, 1)),
          profile_present: character?.identity_profile ? 1 : 0,
        };
        break;
      case 'storyline':
        criteriaBreakdown = {
          story_role: ratio(events.filter((event) => (event.participants ?? []).includes(character?.name)).length, Math.max(events.length, 1)),
          description: character?.description ? 1 : 0,
          project_context: character?.project_id ? 1 : 0,
        };
        break;
      case 'canon_compliance':
        criteriaBreakdown = {
          canon_facts_present: config.canonFacts.length > 0 ? 1 : 0.8,
          creative_constraints_present: config.creativeConstraints.length > 0 ? 1 : 0.8,
          identity_profile: character?.identity_profile ? 1 : 0,
        };
        break;
    }
  }

  if (judgeModel === 'shadow-heuristic-context-v1') {
    criteriaBreakdown = Object.fromEntries(
      Object.entries(criteriaBreakdown).map(([key, value]) => [key, clamp(value * 0.92 + 0.04)])
    );
  }

  const score = avg(Object.values(criteriaBreakdown));
  for (const [criterion, value] of Object.entries(criteriaBreakdown)) {
    if (value < 0.6) {
      failureTags.push(`${judgeType}:${criterion}`);
      reasons.push(`${criterion.replace(/_/g, ' ')} is under threshold`);
    }
  }

  if (failureTags.length === 0) {
    reasons.push(`${judgeType.replace(/_/g, ' ')} passed shadow checks`);
  }

  return {
    judge_type: judgeType,
    judge_model: judgeModel,
    judge_model_version: '2026-03-30',
    score,
    confidence: judgeModel === 'shadow-heuristic-primary-v1' ? 0.74 : 0.68,
    likert_label: buildLikert(score),
    failure_tags: failureTags,
    reasons,
    evidence: {
      target_type: targetType,
      rubric: RUBRICS[targetType][judgeType],
    },
    criteria_breakdown: criteriaBreakdown,
  } satisfies JudgeResult;
}

function aggregateResults(results: JudgeResult[]) {
  const grouped = new Map<JudgeType, JudgeResult[]>();
  for (const result of results) {
    const bucket = grouped.get(result.judge_type) ?? [];
    bucket.push(result);
    grouped.set(result.judge_type, bucket);
  }

  const aggregates: Record<string, number> = {};
  const disagreement: Record<string, number> = {};

  for (const judgeType of JUDGE_TYPES) {
    const bucket = grouped.get(judgeType) ?? [];
    const weighted = bucket.reduce(
      (acc, result) => {
        const reliability = SHADOW_RELIABILITY[result.judge_model]?.[judgeType] ?? 0.5;
        acc.num += result.score * reliability;
        acc.den += reliability;
        acc.values.push(result.score);
        return acc;
      },
      { num: 0, den: 0, values: [] as number[] }
    );

    aggregates[judgeType] = weighted.den > 0 ? clamp(weighted.num / weighted.den) : 0;
    disagreement[judgeType] =
      weighted.values.length > 1 ? clamp(Math.max(...weighted.values) - Math.min(...weighted.values)) : 0;
  }

  return { aggregates, disagreement };
}

function collectReviewFailures(aggregates: Record<string, number>, disagreement: Record<string, number>, thresholds: Record<string, number>) {
  const failures: string[] = [];

  if ((aggregates.storyline ?? 1) < (thresholds.storyline ?? DEFAULT_EVALUATION_THRESHOLDS.storyline)) {
    failures.push('storyline');
  }
  if ((aggregates.continuity ?? 1) < (thresholds.continuity ?? DEFAULT_EVALUATION_THRESHOLDS.continuity)) {
    failures.push('continuity');
  }
  if (
    (aggregates.character_consistency ?? 1) <
    (thresholds.character_consistency ?? DEFAULT_EVALUATION_THRESHOLDS.character_consistency)
  ) {
    failures.push('character_consistency');
  }
  if (
    (aggregates.canon_compliance ?? 1) <
    (thresholds.canon_compliance ?? DEFAULT_EVALUATION_THRESHOLDS.canon_compliance)
  ) {
    failures.push('canon_compliance');
  }

  for (const [judgeType, value] of Object.entries(disagreement)) {
    if (value > (thresholds.max_disagreement ?? DEFAULT_EVALUATION_THRESHOLDS.max_disagreement)) {
      failures.push(`${judgeType}_disagreement`);
    }
  }

  return Array.from(new Set(failures));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (!(await requireAuth(req))) {
    return errorResponse('Unauthorized', 401);
  }

  let generationJobId: string | null = null;
  try {
    const { project_id, target_type, target_id, generation_job_id } = await req.json();
    generationJobId = generation_job_id ?? null;

    if (!project_id || !target_type || !target_id) {
      return errorResponse('project_id, target_type, and target_id are required', 400);
    }

    await updateGenerationJob(supabase, generationJobId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress: 20,
    });

    const config = await fetchProjectEvaluationConfig(supabase, project_id);
    const packet = await getPacket(target_type as TargetType, target_id, project_id);

    const { data: run, error: runError } = await supabase
      .from('evaluation_runs')
      .insert({
        project_id,
        target_type,
        target_id,
        mode: config.evaluationMode || 'shadow',
        rubric_version: SHADOW_RUBRIC_VERSION,
        rubric_snapshot: RUBRICS[target_type as TargetType],
        reliability_snapshot: SHADOW_RELIABILITY,
        status: 'running',
      })
      .select('*')
      .single();

    if (runError || !run) {
      throw new Error(runError?.message || 'Failed to create evaluation run');
    }

    const rawResults = JUDGE_TYPES.flatMap((judgeType) => [
      scoreJudge(target_type, packet, judgeType, 'shadow-heuristic-primary-v1', config),
      scoreJudge(target_type, packet, judgeType, 'shadow-heuristic-context-v1', config),
    ]);

    const { error: insertResultsError } = await supabase.from('evaluation_results').insert(
      rawResults.map((result) => ({
        run_id: run.id,
        judge_type: result.judge_type,
        judge_model: result.judge_model,
        judge_model_version: result.judge_model_version,
        score: result.score,
        confidence: result.confidence,
        likert_label: result.likert_label,
        failure_tags: result.failure_tags,
        reasons: result.reasons,
        evidence: result.evidence,
        criteria_breakdown: result.criteria_breakdown,
      }))
    );

    if (insertResultsError) {
      throw new Error(insertResultsError.message);
    }

    const { aggregates, disagreement } = aggregateResults(rawResults);
    const failureTags = collectReviewFailures(aggregates, disagreement, config.thresholds);

    await supabase
      .from('evaluation_runs')
      .update({
        status: 'completed',
        aggregates,
        disagreement,
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    const summary = buildEvaluationSummary(aggregates, disagreement, failureTags, run.id);
    if (target_type === 'storyline' || target_type === 'scene' || target_type === 'shot') {
      await updateEvaluationSummary(supabase, target_type, target_id, summary);
    } else {
      await supabase
        .from('characters')
        .update({ consistency_summary: summary })
        .eq('id', target_id);
    }

    if (failureTags.length > 0) {
      await supabase.from('review_tasks').insert({
        project_id,
        target_type,
        target_id,
        source_run_id: run.id,
        status: 'open',
        priority: 1,
        mode: 'approve_reject',
        blocking: target_type === 'storyline',
        summary: `Shadow evaluation flagged ${failureTags.join(', ')}`,
        metadata: {
          aggregates,
          disagreement,
        },
      });
    }

    await updateGenerationJob(supabase, generationJobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      result_payload: {
        run_id: run.id,
        aggregates,
        disagreement,
        failure_tags: failureTags,
      },
    });

    return successResponse({
      success: true,
      run_id: run.id,
      aggregates,
      disagreement,
      failure_tags: failureTags,
    });
  } catch (error) {
    console.error('[evaluate-storyboard-packet] error', error);
    await updateGenerationJob(supabase, generationJobId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Evaluation failed',
      completed_at: new Date().toISOString(),
    });
    return errorResponse(error instanceof Error ? error.message : 'Evaluation failed', 500);
  }
});
