// ============================================================================
// EDGE FUNCTION: create-final-asset
// PURPOSE: Stitch together final project assets via remote FAL API
// ROUTE: POST /functions/v1/create-final-asset
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { safeLog } from '../_shared/safe-logger.ts';
import {
  ExportAsset,
  ExportProcessingError,
  ExportSettings,
  createEditframeAsyncRender,
  finalizeEditframeRender,
  getEditframeSetupStatus,
  processAssetsRemote,
} from '../_shared/export-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPORT_BUCKET = 'final-exports';

interface RequestBody {
  action?: 'create' | 'status' | 'setup' | 'reconcile';
  projectId?: string;
  assets?: ExportAsset[];
  jobId?: string;
  settings?: ExportSettings;
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
    const { action = 'create', projectId, assets, jobId, settings } = body;

    if (action === 'setup') {
      return new Response(JSON.stringify(getEditframeSetupStatus()), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    if (action === 'reconcile' && jobId) {
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

      try {
        const result = await finalizeEditframeRender(supabaseAdmin, job, EXPORT_BUCKET);
        return new Response(
          JSON.stringify({
            status: 'completed',
            jobId: job.id,
            outputUrl: result.publicUrl,
            providerPayload: result.providerPayload,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Reconcile failed';
        await supabaseAdmin
          .from('export_jobs')
          .update({
            status: 'failed',
            error_message: message,
            provider_status: 'failed',
            completed_at: new Date().toISOString(),
            provider_payload: {
              ...(job.provider_payload ?? {}),
              stage: 'failed',
              reconcileError: message,
            },
          })
          .eq('id', job.id);

        return new Response(JSON.stringify({ error: message }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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

    if (settings?.provider === 'editframe' && settings.renderMode === 'async') {
      const setup = getEditframeSetupStatus();
      if (!setup.ready) {
        return new Response(
          JSON.stringify({
            error: 'Editframe setup incomplete',
            setup,
          }),
          {
            status: 412,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
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
        provider: settings?.provider === 'editframe' ? 'editframe_remote' : 'fal_remote',
        provider_status: 'processing',
        fallback_used: false,
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create export job: ${jobError?.message}`);
    }

    try {
      if (settings?.provider === 'editframe' && settings.renderMode === 'async') {
        const asyncResult = await createEditframeAsyncRender(
          supabaseAdmin,
          projectId,
          assets,
          job.id,
          settings
        );

        return new Response(
          JSON.stringify({
            status: 'processing',
            jobId: job.id,
            provider: 'editframe_remote',
            providerJobId: asyncResult.renderId,
            progress: 50,
            shotFailures: asyncResult.shotFailures,
            providerPayload: asyncResult.providerPayload,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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

      throw processingError;
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
