export const DEFAULT_EVALUATION_THRESHOLDS = {
  storyline: 0.72,
  continuity: 0.8,
  character_consistency: 0.82,
  canon_compliance: 0.85,
  max_disagreement: 0.2,
};

export const SHADOW_RUBRIC_VERSION = 'shadow-eval-v1';

export const SHADOW_RELIABILITY: Record<string, Record<string, number>> = {
  'shadow-heuristic-primary-v1': {
    prompt_adherence: 0.72,
    visual_quality: 0.68,
    character_consistency: 0.7,
    continuity: 0.71,
    storyline: 0.73,
    canon_compliance: 0.69,
  },
  'shadow-heuristic-context-v1': {
    prompt_adherence: 0.66,
    visual_quality: 0.64,
    character_consistency: 0.67,
    continuity: 0.7,
    storyline: 0.75,
    canon_compliance: 0.71,
  },
};

export async function fetchProjectEvaluationConfig(supabase: any, projectId: string) {
  const { data } = await supabase
    .from('project_settings')
    .select('evaluation_mode, evaluation_thresholds, canon_facts, creative_constraints')
    .eq('project_id', projectId)
    .maybeSingle();

  return {
    evaluationMode: data?.evaluation_mode || 'shadow',
    thresholds: data?.evaluation_thresholds || DEFAULT_EVALUATION_THRESHOLDS,
    canonFacts: Array.isArray(data?.canon_facts) ? data.canon_facts : [],
    creativeConstraints: Array.isArray(data?.creative_constraints) ? data.creative_constraints : [],
  };
}

export async function createPromptVersion(
  supabase: any,
  input: {
    projectId: string;
    stage: string;
    authorType: 'user' | 'system' | 'optimizer' | 'revision_planner';
    text: string;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    parentPromptId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from('prompt_versions')
    .insert({
      project_id: input.projectId,
      stage: input.stage,
      author_type: input.authorType,
      text: input.text,
      source_entity_type: input.sourceEntityType ?? null,
      source_entity_id: input.sourceEntityId ?? null,
      parent_prompt_id: input.parentPromptId ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[observability] Failed to create prompt version:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function createGenerationJob(
  supabase: any,
  input: {
    userId: string;
    projectId: string;
    jobType: 'image' | 'video' | 'evaluation' | 'revision';
    modelId?: string | null;
    status?: 'queued' | 'processing' | 'running' | 'completed' | 'failed';
    inputAssets?: string[];
    config?: Record<string, unknown>;
    resultPayload?: Record<string, unknown>;
  }
) {
  const normalizedStatus = input.status === 'running' ? 'processing' : (input.status ?? 'queued');
  const { data, error } = await supabase
    .from('generation_jobs')
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      job_type: input.jobType,
      model_id: input.modelId ?? null,
      status: normalizedStatus,
      input_assets: input.inputAssets ?? [],
      config: input.config ?? {},
      result_payload: input.resultPayload ?? null,
      progress: normalizedStatus === 'completed' ? 100 : 0,
      started_at: normalizedStatus === 'processing' ? new Date().toISOString() : null,
      completed_at: normalizedStatus === 'completed' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[observability] Failed to create generation job:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function updateGenerationJob(
  supabase: any,
  jobId: string | null,
  updates: Record<string, unknown>
) {
  if (!jobId) return;

  const normalizedUpdates = { ...updates };
  if (normalizedUpdates.status === 'running') {
    normalizedUpdates.status = 'processing';
  }

  const { error } = await supabase
    .from('generation_jobs')
    .update(normalizedUpdates)
    .eq('id', jobId);

  if (error) {
    console.warn('[observability] Failed to update generation job:', error.message);
  }
}

export async function createProjectAsset(
  supabase: any,
  input: {
    projectId: string;
    userId?: string | null;
    name: string;
    type: 'image' | 'video' | 'audio';
    url: string;
    size?: number | null;
    thumbnailUrl?: string | null;
    storageBucket?: string | null;
    storagePath?: string | null;
    previewUrl?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  let ownerId = input.userId ?? null;
  if (!ownerId) {
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', input.projectId)
      .maybeSingle();

    if (!projectError) {
      ownerId = projectData?.user_id ?? null;
    }
  }

  const mimeType =
    input.type === 'image'
      ? 'image/png'
      : input.type === 'video'
        ? 'video/mp4'
        : 'audio/mpeg';

  const size = Math.max(1, input.size ?? 1);
  const storageBucket = input.storageBucket ?? 'workflow-media';
  const storagePath = input.storagePath ?? input.url;

  const richInsertPayload = {
    user_id: ownerId,
    project_id: input.projectId,
    file_name: input.name,
    original_file_name: input.name,
    mime_type: mimeType,
    file_size_bytes: size,
    asset_type: input.type,
    asset_category: 'generated',
    storage_provider: storagePath === input.url ? 'custom' : 'supabase',
    storage_bucket: storageBucket,
    storage_path: storagePath,
    cdn_url: input.url,
    media_metadata: input.metadata ?? {},
    processing_status: 'completed',
    thumbnail_url: input.thumbnailUrl ?? null,
    preview_url: input.previewUrl ?? null,
    used_in_pages: ['timeline'],
    visibility: 'project',
  };

  if (ownerId) {
    const { data, error } = await supabase
      .from('project_assets')
      .insert(richInsertPayload)
      .select('id')
      .single();

    if (!error && data?.id) {
      return data.id;
    }

    if (error) {
      console.warn('[observability] Rich project asset insert failed, trying legacy schema:', error.message);
    }
  }

  const { data, error } = await supabase
    .from('project_assets')
    .insert({
      project_id: input.projectId,
      name: input.name,
      type: input.type,
      url: input.url,
      size: input.size ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[observability] Failed to create project asset:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function createAssetLineage(
  supabase: any,
  input: {
    projectId: string;
    promptVersionId?: string | null;
    generationJobId?: string | null;
    sourceAssetId?: string | null;
    outputAssetId?: string | null;
    sceneId?: string | null;
    shotId?: string | null;
    characterId?: string | null;
    relationType?: 'input' | 'output' | 'reference' | 'derived';
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from('asset_lineage').insert({
    project_id: input.projectId,
    prompt_version_id: input.promptVersionId ?? null,
    generation_job_id: input.generationJobId ?? null,
    source_asset_id: input.sourceAssetId ?? null,
    output_asset_id: input.outputAssetId ?? null,
    scene_id: input.sceneId ?? null,
    shot_id: input.shotId ?? null,
    character_id: input.characterId ?? null,
    relation_type: input.relationType ?? 'derived',
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn('[observability] Failed to create asset lineage:', error.message);
  }
}

export async function enqueueStoryboardEvaluation(
  supabase: any,
  input: {
    userId: string;
    projectId: string;
    targetType: 'storyline' | 'scene' | 'shot' | 'character';
    targetId: string;
    sourceGenerationJobId?: string | null;
  }
) {
  const jobId = await createGenerationJob(supabase, {
    userId: input.userId,
    projectId: input.projectId,
    jobType: 'evaluation',
    modelId: 'shadow-evaluator',
    status: 'queued',
    config: {
      target_type: input.targetType,
      target_id: input.targetId,
      source_generation_job_id: input.sourceGenerationJobId ?? null,
    },
  });

  try {
    await supabase.functions.invoke('evaluate-storyboard-packet', {
      body: {
        project_id: input.projectId,
        target_type: input.targetType,
        target_id: input.targetId,
        generation_job_id: jobId,
      },
    });
  } catch (error) {
    console.warn('[observability] Failed to invoke evaluate-storyboard-packet:', error);
    await updateGenerationJob(supabase, jobId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Failed to invoke evaluate-storyboard-packet',
      completed_at: new Date().toISOString(),
    });
  }

  return jobId;
}

export async function createNarrativeArtifacts(
  supabase: any,
  input: {
    projectId: string;
    storylineId: string;
    scenes: Array<{ id: string; title?: string | null; description?: string | null; scene_number: number; story_goal?: string | null }>;
    fullStory?: string;
  }
) {
  const atomRows = input.scenes.flatMap((scene) => {
    const title = scene.title || `Scene ${scene.scene_number}`;
    const description = scene.description || title;
    return [
      {
        project_id: input.projectId,
        storyline_id: input.storylineId,
        scene_id: scene.id,
        beat_type: 'goal',
        description: scene.story_goal || `${title}: ${description}`,
        required_visual_evidence: [title],
        required_story_evidence: [description],
        is_blocking: true,
      },
      {
        project_id: input.projectId,
        storyline_id: input.storylineId,
        scene_id: scene.id,
        beat_type: 'transition',
        description: `${title} advances the narrative from the previous beat`,
        required_visual_evidence: [scene.story_goal || title],
        required_story_evidence: [description],
        is_blocking: false,
      },
    ];
  });

  if (atomRows.length > 0) {
    const { error } = await supabase.from('narrative_atoms').insert(atomRows);
    if (error) {
      console.warn('[observability] Failed to create narrative atoms:', error.message);
    }
  }

  const eventRows = input.scenes.map((scene, index) => ({
    project_id: input.projectId,
    storyline_id: input.storylineId,
    scene_id: scene.id,
    description: scene.story_goal || scene.description || scene.title || `Scene ${scene.scene_number}`,
    participants: [],
    causes: index > 0 ? [`scene_${input.scenes[index - 1].scene_number}`] : [],
    consequences: index < input.scenes.length - 1 ? [`scene_${input.scenes[index + 1].scene_number}`] : [],
    emotional_state: {},
    evidence_asset_ids: [],
    timestamp_range: null,
  }));

  if (eventRows.length > 0) {
    const { error } = await supabase.from('story_events').insert(eventRows);
    if (error) {
      console.warn('[observability] Failed to create story events:', error.message);
    }
  }
}

export function buildEvaluationSummary(aggregates: Record<string, number>, disagreement: Record<string, number>, failureTags: string[], latestRunId: string) {
  const scores = Object.values(aggregates).filter((value) => typeof value === 'number');
  const worstScore = scores.length ? Math.min(...scores) : 1;
  const disagreementValues = Object.values(disagreement).filter((value) => typeof value === 'number');
  const maxDisagreement = disagreementValues.length ? Math.max(...disagreementValues) : 0;
  const needsAttention =
    failureTags.length > 0 || maxDisagreement > DEFAULT_EVALUATION_THRESHOLDS.max_disagreement;

  return {
    latestRunId,
    aggregates,
    disagreement,
    failureTags,
    status: needsAttention ? (worstScore < 0.75 ? 'needs_revision' : 'needs_review') : 'clear',
    updatedAt: new Date().toISOString(),
  };
}

export async function updateEvaluationSummary(
  supabase: any,
  targetType: 'storyline' | 'scene' | 'shot',
  targetId: string,
  summary: Record<string, unknown>
) {
  const table = targetType === 'storyline' ? 'storylines' : `${targetType}s`;
  const { error } = await supabase
    .from(table)
    .update({
      evaluation_summary: summary,
      review_status: summary.status ?? 'clear',
    })
    .eq('id', targetId);

  if (error) {
    console.warn('[observability] Failed to update evaluation summary:', error.message);
  }
}
