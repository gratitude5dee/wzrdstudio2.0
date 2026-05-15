import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ExportProcessingError,
  processAssetsRemote,
} from '../_shared/export-helpers.ts';
import type { ExportAsset, ExportSettings } from '../_shared/export-helpers.ts';
import {
  buildDirectorCutTimeline,
  buildDirectorCutSummary,
  missingShotDetailsToFailures,
} from '../_shared/director-cut-timeline.ts';
import type {
  DirectorCutSceneRow,
  DirectorCutShotRow,
  DirectorCutSummary,
  ProjectVisualAssetRow,
  ShotFailureInfo,
} from '../_shared/director-cut-timeline.ts';
import { safeLog } from '../_shared/safe-logger.ts';
import { buildEditorTimelineAssetRows, isRecord } from './timeline-assets.ts';
import {
  buildDirectorCutRemotionManifest,
  resolveDirectorCutRenderBackend,
} from './remotion-manifest.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPORT_BUCKET = 'final-exports';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TimelineAssetRow {
  id: string;
  position_order: number;
  asset_type: 'image' | 'video' | 'audio';
  source_url: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
}

interface RequestBody {
  action: 'sync' | 'create' | 'retry' | 'status';
  projectId?: string;
  jobId?: string;
  settings?: ExportSettings;
}

type SupabaseAdminClient = ReturnType<typeof createClient>;

type TimelineAssetRole = 'shot_visual' | 'voiceover' | 'sfx' | 'music';

const mapRoleToSubtype = (role: TimelineAssetRole) => {
  if (role === 'voiceover' || role === 'sfx' || role === 'music') {
    return role;
  }
  return 'visual';
};

const mapTimelineAssetsToExportAssets = (assets: TimelineAssetRow[]): ExportAsset[] =>
  assets
    .filter((asset) => !!asset.source_url)
    .map((asset) => {
      const meta = (asset.metadata ?? {}) as Record<string, unknown>;
      const role = (meta.asset_role as TimelineAssetRole) ?? 'shot_visual';
      return {
        id: asset.id,
        type: asset.asset_type,
        subtype: mapRoleToSubtype(role),
        url: asset.source_url!,
        duration_ms: asset.duration_ms ?? undefined,
        order_index: asset.position_order,
        metadata: meta,
      };
    });



const getEditorTimelineRows = async (
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  projectId: string
) => {
  const { data: timeline, error } = await supabaseAdmin
    .from('timelines')
    .select('composition_data, duration_ms, resolution, frame_rate, updated_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !timeline) {
    if (error) {
      safeLog('warn', 'director-cut.editor_timeline.lookup_failed', { error: error.message, projectId });
    }
    return null;
  }

  const document = isRecord(timeline.composition_data) ? timeline.composition_data : {};
  const editorTimeline = buildEditorTimelineAssetRows(document, projectId, userId);
  return editorTimeline ? { ...editorTimeline, document } : null;
};

const buildEditorReadinessSummary = (summary: {
  totalShots: number;
  syncedAssets: number;
  readyVideos: number;
  fallbackImages: number;
  missingShots: number;
}): DirectorCutSummary => {
  const missingShotDetails = Array.from({ length: summary.missingShots }, (_, index) => ({
    shotId: `editor-missing-${index}`,
    sceneId: null,
    sceneNumber: null,
    shotNumber: null,
    orderIndex: summary.readyVideos + summary.fallbackImages + index,
    reason: 'Editor timeline clip is missing a public image or video URL',
  }));

  return buildDirectorCutSummary({
    totalShots: summary.totalShots,
    syncedAssets: summary.syncedAssets,
    readyVideos: summary.readyVideos,
    fallbackImages: summary.fallbackImages,
    missingShotDetails,
    audioAssets: Math.max(0, summary.syncedAssets - summary.readyVideos - summary.fallbackImages),
  });
};

const assertProjectAccess = async (supabaseAdmin: SupabaseAdminClient, userId: string, projectId: string) => {
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  if (projectError || !project || project.user_id !== userId) {
    throw new Error('Project not found or access denied');
  }

  return project;
};

const loadOrderedScenesAndShots = async (supabaseAdmin: SupabaseAdminClient, projectId: string) => {
  const { data: scenes, error: scenesError } = await supabaseAdmin
    .from('scenes')
    .select('id, scene_number')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (scenesError) {
    throw new Error(`Failed to fetch scenes: ${scenesError.message}`);
  }

  const { data: shots, error: shotsError } = await supabaseAdmin
    .from('shots')
    .select(
      'id, scene_id, shot_number, image_url, upscaled_image_url, video_url, audio_url, audio_status, image_status, video_status, prompt_idea, visual_prompt, dialogue, sound_effects'
    )
    .eq('project_id', projectId);

  if (shotsError) {
    throw new Error(`Failed to fetch shots: ${shotsError.message}`);
  }

  return {
    scenes: (scenes || []) as DirectorCutSceneRow[],
    shots: (shots || []) as DirectorCutShotRow[],
  };
};

const loadGeneratedProjectVisualAssets = async (
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  projectId: string
): Promise<ProjectVisualAssetRow[]> => {
  const { data: richAssets, error: richError } = await supabaseAdmin
    .from('project_assets')
    .select('id, user_id, project_id, asset_type, asset_category, processing_status, is_archived, cdn_url, preview_url, thumbnail_url, media_metadata, created_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('asset_category', 'generated')
    .eq('processing_status', 'completed')
    .eq('is_archived', false)
    .in('asset_type', ['image', 'video'])
    .not('cdn_url', 'is', null)
    .not('media_metadata->>shot_id', 'is', null)
    .order('created_at', { ascending: false });

  if (!richError) {
    return (richAssets || []) as ProjectVisualAssetRow[];
  }

  safeLog('warn', 'director-cut.project_assets.rich_lookup_failed', {
    error: richError.message,
    projectId,
  });

  const { data: legacyAssets, error: legacyError } = await supabaseAdmin
    .from('project_assets')
    .select('id, project_id, type, url, thumbnail_url, metadata, created_at')
    .eq('project_id', projectId)
    .in('type', ['image', 'video'])
    .not('url', 'is', null)
    .not('metadata->>shot_id', 'is', null)
    .order('created_at', { ascending: false });

  if (legacyError) {
    throw new Error(`Failed to fetch generated project visual assets: ${legacyError.message}`);
  }

  return (legacyAssets || []) as ProjectVisualAssetRow[];
};

const getDirectorCutReadiness = async (
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  projectId: string,
  syncedAssets = 0,
  audioAssets = 0
) => {
  await assertProjectAccess(supabaseAdmin, userId, projectId);
  const editorTimeline = await getEditorTimelineRows(supabaseAdmin, userId, projectId);
  if (editorTimeline) {
    const editorSummary = buildEditorReadinessSummary(editorTimeline.summary);
    return {
      ...editorSummary,
      syncedAssets: syncedAssets || editorSummary.syncedAssets,
      audioAssets: audioAssets || editorSummary.audioAssets,
    };
  }

  const { scenes, shots } = await loadOrderedScenesAndShots(supabaseAdmin, projectId);
  const projectVisualAssets = await loadGeneratedProjectVisualAssets(supabaseAdmin, userId, projectId);
  const { summary } = buildDirectorCutTimeline({
    projectId,
    userId,
    scenes,
    shots,
    projectVisualAssets,
  });

  return {
    ...summary,
    syncedAssets: syncedAssets || summary.syncedAssets,
    audioAssets: audioAssets || summary.audioAssets,
  };
};

const preflightFailureResponse = (summary: DirectorCutSummary) =>
  new Response(
    JSON.stringify({
      success: false,
      error: 'DIRECTOR_CUT_PREFLIGHT_FAILED',
      message: summary.blockingReason ?? "Director's Cut preflight failed.",
      summary,
    }),
    {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );

const syncTimelineAssets = async (supabaseAdmin: SupabaseAdminClient, userId: string, projectId: string) => {
  await assertProjectAccess(supabaseAdmin, userId, projectId);

  const editorTimeline = await getEditorTimelineRows(supabaseAdmin, userId, projectId);
  if (editorTimeline) {
    await supabaseAdmin.from('timeline_assets').delete().eq('project_id', projectId);

    if (editorTimeline.rows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('timeline_assets')
        .insert(editorTimeline.rows);

      if (insertError) {
        throw new Error(`Failed to write editor timeline assets: ${insertError.message}`);
      }
    }

    return buildEditorReadinessSummary(editorTimeline.summary);
  }

  const { scenes, shots } = await loadOrderedScenesAndShots(supabaseAdmin, projectId);
  const projectVisualAssets = await loadGeneratedProjectVisualAssets(supabaseAdmin, userId, projectId);

  const { data: finalAudioAssets, error: finalAudioError } = await supabaseAdmin
    .from('final_project_assets')
    .select('id, asset_type, file_url, duration_ms, metadata')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('asset_type', 'audio');

  if (finalAudioError) {
    throw new Error(`Failed to fetch final audio assets: ${finalAudioError.message}`);
  }

  await supabaseAdmin.from('timeline_assets').delete().eq('project_id', projectId);

  const { rowsToInsert, summary } = buildDirectorCutTimeline({
    projectId,
    userId,
    scenes,
    shots,
    projectVisualAssets,
    finalAudioAssets: finalAudioAssets || [],
  });

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('timeline_assets')
      .insert(rowsToInsert);

    if (insertError) {
      throw new Error(`Failed to write timeline assets: ${insertError.message}`);
    }
  }

  return summary;
};

const runDirectorCutJob = async (
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  projectId: string,
  jobId: string,
  assets: ExportAsset[],
  settings: ExportSettings | undefined,
  readinessSummary: DirectorCutSummary
) => {
  const skippedShotFailures = missingShotDetailsToFailures(readinessSummary.missingShotDetails);
  const partialExportPayload = {
    exportMode: readinessSummary.exportMode,
    isCompleteCut: readinessSummary.isCompleteCut,
    skippedShotCount: readinessSummary.skippedShotCount,
    missingShots: readinessSummary.missingShots,
    missingShotDetails: readinessSummary.missingShotDetails,
    partialSuccess: readinessSummary.skippedShotCount > 0,
    failedShotCount: skippedShotFailures.length,
    shotFailures: skippedShotFailures,
  };

  try {
    await supabaseAdmin
      .from('export_jobs')
      .update({
        provider: 'fal_remote',
        provider_status: 'processing',
        progress: 10,
        provider_payload: {
          stage: 'submitting_to_provider',
          ...partialExportPayload,
        },
      })
      .eq('id', jobId);

    const result = await processAssetsRemote(
      supabaseAdmin,
      projectId,
      assets,
      jobId,
      EXPORT_BUCKET,
      settings,
      userId
    );
    const { publicUrl, shotFailures } = result;
    const combinedShotFailures: ShotFailureInfo[] = [
      ...skippedShotFailures,
      ...shotFailures,
    ];

    const completedPayload: Record<string, unknown> = {
      ...(result.providerPayload ?? {}),
      stage: 'completed',
      exportMode: readinessSummary.exportMode,
      isCompleteCut: readinessSummary.isCompleteCut && shotFailures.length === 0,
      skippedShotCount: readinessSummary.skippedShotCount,
      missingShots: readinessSummary.missingShots,
      missingShotDetails: readinessSummary.missingShotDetails,
      partialSuccess: combinedShotFailures.length > 0,
      failedShotCount: combinedShotFailures.length,
    };
    if (combinedShotFailures.length > 0) {
      completedPayload.shotFailures = combinedShotFailures;
    }

    await supabaseAdmin
      .from('export_jobs')
      .update({
        status: 'completed',
        progress: 100,
        output_url: publicUrl,
        provider: result.provider,
        provider_status: 'completed',
        fallback_used: result.fallbackUsed,
        completed_at: new Date().toISOString(),
        provider_payload: completedPayload,
      })
      .eq('id', jobId);

    const { error: finalAssetError } = await supabaseAdmin
      .from('final_project_assets')
      .insert({
        project_id: projectId,
        user_id: userId,
        asset_type: 'video',
        file_url: publicUrl,
        storage_bucket: EXPORT_BUCKET,
        duration_ms: result.mediaInfo?.duration_ms ?? null,
        metadata: {
          export_job_id: jobId,
          source: 'director_cut',
          partial_success: combinedShotFailures.length > 0,
          export_mode: readinessSummary.exportMode,
          is_complete_cut: readinessSummary.isCompleteCut && shotFailures.length === 0,
          skipped_shot_count: readinessSummary.skippedShotCount,
          thumbnail_url: result.posterFrameUrl ?? null,
          media_info: result.mediaInfo ?? null,
        },
      });

    if (finalAssetError) {
      safeLog('warn', 'director-cut.final_asset.record_failed', { error: finalAssetError, jobId, projectId });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    const remoteShotFailures = error instanceof ExportProcessingError ? error.shotFailures : [];
    const combinedShotFailures = [...skippedShotFailures, ...remoteShotFailures];
    const providerPayload = error instanceof ExportProcessingError
      ? {
          ...error.providerPayload,
          stage: 'failed',
          exportMode: readinessSummary.exportMode,
          isCompleteCut: false,
          skippedShotCount: readinessSummary.skippedShotCount,
          missingShots: readinessSummary.missingShots,
          missingShotDetails: readinessSummary.missingShotDetails,
          partialSuccess: combinedShotFailures.length > 0,
          shotFailures: combinedShotFailures,
          failedShotCount: combinedShotFailures.length,
        }
      : {
          stage: 'failed',
          error: message,
          exportMode: readinessSummary.exportMode,
          isCompleteCut: false,
          skippedShotCount: readinessSummary.skippedShotCount,
          missingShots: readinessSummary.missingShots,
          missingShotDetails: readinessSummary.missingShotDetails,
          partialSuccess: skippedShotFailures.length > 0,
          shotFailures: skippedShotFailures,
          failedShotCount: skippedShotFailures.length,
        };
    safeLog('error', 'director-cut.processing.failed', { error, jobId, projectId, providerPayload });
    await supabaseAdmin
      .from('export_jobs')
      .update({
        status: 'failed',
        error_message: message,
        provider_status: 'failed',
        completed_at: new Date().toISOString(),
        provider_payload: providerPayload,
      })
      .eq('id', jobId);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let requestBody: RequestBody | null = null;
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    requestBody = (await req.json()) as RequestBody;
    const { action, projectId, jobId, settings } = requestBody;

    if (!action) {
      return new Response(JSON.stringify({ error: 'action is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      if (!jobId) {
        return new Response(JSON.stringify({ error: 'jobId is required for status' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: job, error } = await supabaseAdmin
        .from('export_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .single();

      if (error || !job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          status: job.status,
          progress: job.progress,
          outputUrl: job.output_url,
          error: job.error_message,
          provider: job.provider,
          providerStatus: job.provider_status,
          providerJobId: job.provider_job_id,
          fallbackUsed: job.fallback_used,
          providerPayload: job.provider_payload,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync') {
      const summary = await syncTimelineAssets(supabaseAdmin, user.id, projectId);
      return new Response(JSON.stringify({ success: true, summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create' || action === 'retry') {
      let readinessSummary: DirectorCutSummary;
      if (action === 'create') {
        readinessSummary = await syncTimelineAssets(supabaseAdmin, user.id, projectId);
      } else {
        readinessSummary = await getDirectorCutReadiness(supabaseAdmin, user.id, projectId);
      }

      if (!readinessSummary.canExport) {
        return preflightFailureResponse(readinessSummary);
      }

      const { data: timelineAssets, error: timelineError } = await supabaseAdmin
        .from('timeline_assets')
        .select('id, position_order, asset_type, source_url, duration_ms, metadata')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('position_order', { ascending: true });

      if (timelineError) {
        throw new Error(`Failed to load timeline assets: ${timelineError.message}`);
      }

      const exportAssets = mapTimelineAssetsToExportAssets(
        (timelineAssets || []) as TimelineAssetRow[]
      );
      const visualExportAssets = exportAssets.filter((asset) => asset.type === 'image' || asset.type === 'video');
      if (visualExportAssets.length === 0 || visualExportAssets.length < readinessSummary.readyShots) {
        return preflightFailureResponse({
          ...readinessSummary,
          syncedAssets: timelineAssets?.length ?? 0,
          canExport: false,
          exportMode: 'blocked',
          isCompleteCut: false,
          blockingReason:
            "Synced timeline assets are stale. Sync timeline assets before retrying Director's Cut.",
        });
      }

      const renderBackend = resolveDirectorCutRenderBackend(settings ?? {});
      if (renderBackend === 'remotion_worker') {
        const editorTimeline = await getEditorTimelineRows(supabaseAdmin, user.id, projectId);
        if (!editorTimeline?.document) {
          throw new Error('Remotion worker export requires a saved editor timeline.');
        }

        const remotionManifest = buildDirectorCutRemotionManifest(editorTimeline.document, settings ?? {});
        const remotionPayload = {
          stage: 'queued_for_remotion_worker',
          renderer: 'remotion',
          outputBucket: EXPORT_BUCKET,
          exportMode: readinessSummary.exportMode,
          isCompleteCut: readinessSummary.isCompleteCut,
          skippedShotCount: readinessSummary.skippedShotCount,
          missingShots: readinessSummary.missingShots,
          missingShotDetails: readinessSummary.missingShotDetails,
          partialSuccess: readinessSummary.skippedShotCount > 0,
          failedShotCount: readinessSummary.missingShotDetails.length,
          shotFailures: missingShotDetailsToFailures(readinessSummary.missingShotDetails),
          remotionManifest,
        };

        const { data: job, error: jobError } = await supabaseAdmin
          .from('export_jobs')
          .insert({
            project_id: projectId,
            user_id: user.id,
            status: 'processing',
            progress: 5,
            settings: settings ?? {},
            started_at: new Date().toISOString(),
            provider: 'remotion_worker',
            provider_status: 'queued',
            fallback_used: false,
            provider_payload: remotionPayload,
          })
          .select()
          .single();

        if (jobError || !job) {
          throw new Error(`Failed to create export job: ${jobError?.message}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            status: 'processing',
            jobId: job.id,
            progress: 5,
            provider: 'remotion_worker',
            providerStatus: 'queued',
            fallbackUsed: false,
            exportMode: readinessSummary.exportMode,
            isCompleteCut: readinessSummary.isCompleteCut,
            skippedShotCount: readinessSummary.skippedShotCount,
            providerPayload: remotionPayload,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const skippedShotFailures = missingShotDetailsToFailures(readinessSummary.missingShotDetails);
      const initialProviderPayload = {
        stage: 'syncing_assets',
        exportMode: readinessSummary.exportMode,
        isCompleteCut: readinessSummary.isCompleteCut,
        skippedShotCount: readinessSummary.skippedShotCount,
        missingShots: readinessSummary.missingShots,
        missingShotDetails: readinessSummary.missingShotDetails,
        partialSuccess: readinessSummary.skippedShotCount > 0,
        failedShotCount: skippedShotFailures.length,
        shotFailures: skippedShotFailures,
      };

      const { data: job, error: jobError } = await supabaseAdmin
        .from('export_jobs')
        .insert({
          project_id: projectId,
          user_id: user.id,
          status: 'processing',
          progress: 5,
          settings: settings ?? {},
          started_at: new Date().toISOString(),
          provider: 'fal_remote',
          provider_status: 'queued',
          fallback_used: false,
          provider_payload: initialProviderPayload,
        })
        .select()
        .single();

      if (jobError || !job) {
        throw new Error(`Failed to create export job: ${jobError?.message}`);
      }

      // runDirectorCutJob handles its own error recording
      const runPromise = runDirectorCutJob(
        supabaseAdmin,
        user.id,
        projectId,
        job.id,
        exportAssets,
        settings,
        readinessSummary
      );

      // Edge Runtime background execution
      const maybeEdgeRuntime = (
        globalThis as typeof globalThis & {
          EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
        }
      ).EdgeRuntime;
      if (maybeEdgeRuntime?.waitUntil) {
        maybeEdgeRuntime.waitUntil(runPromise);
      } else {
        runPromise.catch(() => undefined);
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'processing',
          jobId: job.id,
          progress: 5,
          provider: 'fal_remote',
          providerStatus: 'queued',
          fallbackUsed: false,
          exportMode: readinessSummary.exportMode,
          isCompleteCut: readinessSummary.isCompleteCut,
          skippedShotCount: readinessSummary.skippedShotCount,
          providerPayload: initialProviderPayload,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    safeLog('error', 'director-cut.error', { error, projectId: requestBody?.projectId, jobId: requestBody?.jobId });
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
