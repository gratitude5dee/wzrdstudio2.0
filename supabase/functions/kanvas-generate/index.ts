import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { handleCors, errorResponse, successResponse } from '../_shared/response.ts';
import type { KanvasGenerationRequest } from '../_shared/kanvas.ts';
import { submitKanvasJob } from '../_shared/kanvas.ts';
import { createKanvasRepository, createKanvasServiceDeps } from '../_shared/kanvas-runtime.ts';
import { InsufficientCreditsError } from '../_shared/credits.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as KanvasGenerationRequest;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const repository = createKanvasRepository(supabase);
    const deps = createKanvasServiceDeps(supabase);
    const job = await submitKanvasJob(body, user.id, repository, deps);

    return successResponse({
      jobId: job.id,
      requestId: job.externalRequestId,
      status: job.status,
      job,
    });
  } catch (error) {
    console.error('kanvas-generate error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    if (error instanceof InsufficientCreditsError) {
      return errorResponse(error.message, 402, {
        code: error.code,
        required: error.required,
        available: error.available,
        topUpUrl: error.topUpUrl,
      });
    }

    return errorResponse(error instanceof Error ? error.message : 'Failed to start Kanvas generation', 500);
  }
});
