import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { AuthError, authenticateRequest } from '../_shared/auth.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';

interface RevokeShareRequest {
  shareId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await authenticateRequest(req.headers);
    const body = (await req.json()) as RevokeShareRequest;
    const shareId = typeof body.shareId === 'string' ? body.shareId.trim() : '';

    if (!shareId) {
      return errorResponse('shareId is required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('id, project_id')
      .eq('id', shareId)
      .eq('shared_by', user.id)
      .maybeSingle();

    if (shareError) {
      console.error('revoke-share lookup error:', shareError);
      return errorResponse('Failed to load share', 500);
    }

    if (!share) {
      return errorResponse('Share not found', 404);
    }

    const { error: deleteError } = await supabase
      .from('project_shares')
      .delete()
      .eq('id', shareId)
      .eq('shared_by', user.id);

    if (deleteError) {
      console.error('revoke-share delete error:', deleteError);
      return errorResponse('Failed to revoke share', 500);
    }

    if (share.project_id) {
      try {
        await supabase.channel(`project:${share.project_id}`).send({
          type: 'broadcast',
          event: 'share_revoked',
          payload: { shareId },
        });
      } catch (broadcastError) {
        console.warn('revoke-share broadcast failed (non-critical):', broadcastError);
      }
    }

    return successResponse({ success: true, shareId });
  } catch (error) {
    console.error('revoke-share error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    return errorResponse(error instanceof Error ? error.message : 'Failed to revoke share', 500);
  }
});
