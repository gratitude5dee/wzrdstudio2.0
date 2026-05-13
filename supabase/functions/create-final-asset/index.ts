// ============================================================================
// EDGE FUNCTION: create-final-asset
// PURPOSE: Stitch together final project assets via remote FAL API.
// Client falls back to in-browser ffmpeg.wasm when this server path fails.
// ROUTE: POST /functions/v1/create-final-asset
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { safeLog } from '../_shared/safe-logger.ts';
import {
  ExportAsset,
  ExportProcessingError,
  ExportSettings,
  processAssetsRemote,
} from '../_shared/export-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPORT_BUCKET = 'final-exports';

interface RequestBody {
  action?: 'create' | 'status' | 'finalize_local';
  projectId?: string;
  assets?: ExportAsset[];
  jobId?: string;
  settings?: ExportSettings;
  // For finalize_local: a Supabase Storage path of an already-uploaded mp4.
  outputUrl?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const body = (await req.json()) as RequestBody;
    const { action = 'create', projectId, assets, jobId, settings, outputUrl } = body;

    if (action === 'status' && jobId) {
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
          fallbackUsed: job.fallback_used,
          providerPayload: job.provider_payload,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Client-side WASM render finished; record the result in the job row.
    if (action === 'finalize_local' && jobId && outputUrl) {
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

      const completedPayload = {
        ...(job.provider_payload ?? {}),
        stage: 'completed',
        renderer: 'wasm_local',
        clientFallback: 'wasm',
      };

      await supabaseAdmin
        .from('export_jobs')
        .update({
          status: 'completed',
          progress: 100,
          output_url: outputUrl,
          provider: 'wasm_local',
          provider_status: 'completed',
          fallback_used: true,
          completed_at: new Date().toISOString(),
          provider_payload: completedPayload,
        })
        .eq('id', jobId);

      await supabaseAdmin.from('final_project_assets').insert({
        project_id: job.project_id,
        user_id: user.id,
        asset_type: 'video',
        file_url: outputUrl,
        metadata: {
          name: 'WASM Local Export',
          asset_subtype: 'final_export',
          export_job_id: jobId,
          url: outputUrl,
        },
      });

      return new Response(
        JSON.stringify({ status: 'completed', jobId, outputUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectId || !assets || assets.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing projectId or assets' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Project not found or access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from('export_jobs')
      .insert({
        project_id: projectId,
        user_id: user.id,
        status: 'processing',
        progress: 0,
        settings,
        started_at: new Date().toISOString(),
        provider: 'fal_remote',
        provider_status: 'processing',
        fallback_used: false,
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create export job: ${jobError?.message}`);
    }

    try {
      const result = await processAssetsRemote(
        supabaseAdmin,
        projectId,
        assets,
        job.id,
        EXPORT_BUCKET,
        settings,
        user.id
      );
      const { publicUrl, shotFailures } = result;

      const completedPayload: Record<string, unknown> = {
        ...(result.providerPayload ?? {}),
        stage: 'completed',
      };
      if (shotFailures.length > 0) {
        completedPayload.shotFailures = shotFailures;
        completedPayload.partialSuccess = true;
        completedPayload.failedShotCount = shotFailures.length;
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
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          status: 'completed',
          jobId: job.id,
          outputUrl: publicUrl,
          ...(shotFailures.length > 0 ? { shotFailures } : {}),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (processingError) {
      const message =
        processingError instanceof Error ? processingError.message : 'Unknown processing error';
      const providerPayload = processingError instanceof ExportProcessingError
        ? {
            ...processingError.providerPayload,
            stage: 'failed',
            shotFailures: processingError.shotFailures,
            failedShotCount: processingError.shotFailures.length,
          }
        : { stage: 'failed', error: message };

      await supabaseAdmin
        .from('export_jobs')
        .update({
          status: 'failed',
          error_message: message,
          provider_status: 'failed',
          completed_at: new Date().toISOString(),
          provider_payload: providerPayload,
        })
        .eq('id', job.id);

      // Return 200 with structured failure so the client can fall back to WASM
      // without losing the diagnostics.
      return new Response(
        JSON.stringify({
          status: 'failed',
          jobId: job.id,
          error: message,
          providerPayload,
          assets,
          settings,
          clientFallback: 'wasm',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    safeLog('error', 'create-final-asset.error', { error });
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
