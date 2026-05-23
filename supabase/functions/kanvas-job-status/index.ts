import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { handleCors, errorResponse, successResponse } from '../_shared/response.ts';
import { refreshKanvasJob } from '../_shared/kanvas.ts';
import { createKanvasRepository, createKanvasServiceDeps } from '../_shared/kanvas-runtime.ts';

interface KanvasJobStatusRequest {
  jobId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as KanvasJobStatusRequest;

    if (!body.jobId) {
      return errorResponse('jobId is required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const repository = createKanvasRepository(supabase);
    const deps = createKanvasServiceDeps(supabase);
    const job = await refreshKanvasJob(body.jobId, user.id, repository, deps);

    return successResponse({ job });
  } catch (error) {
    console.error('kanvas-job-status error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    return errorResponse(error instanceof Error ? error.message : 'Failed to refresh Kanvas job', 500);
  }
});
