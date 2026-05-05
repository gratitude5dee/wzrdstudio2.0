/**
 * overshoot-stream - Server-side facade for Overshoot stream lifecycle.
 *
 * The browser may receive scoped LiveKit publish tokens from Overshoot, but
 * never receives OVERSHOOT_API_KEY. Use this for the later live/timeline path:
 * create -> publish via LiveKit -> poll first frame -> keepalive every 10-20s
 * while active -> delete when finished.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import {
  executeOvershootStreamAction,
  type OvershootStreamAction,
} from '../_shared/overshoot-client.ts';

interface StreamRequest {
  action: OvershootStreamAction;
  streamId?: string;
}

const VALID_ACTIONS = new Set<OvershootStreamAction>(['create', 'get', 'keepalive', 'delete']);

function getOvershootApiKey() {
  const key = Deno.env.get('OVERSHOOT_API_KEY');
  if (!key) {
    throw new Error('OVERSHOOT_API_KEY environment variable is not set');
  }
  return key;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    await authenticateRequest(req.headers);

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed. Use POST.', 405);
    }

    const body: StreamRequest = await req.json();
    if (!VALID_ACTIONS.has(body.action)) {
      return errorResponse('Invalid action. Must be one of: create, get, keepalive, delete', 400);
    }
    if (body.action !== 'create' && !body.streamId) {
      return errorResponse('streamId is required for this action', 400);
    }

    const data = await executeOvershootStreamAction({
      apiKey: getOvershootApiKey(),
      action: body.action,
      streamId: body.streamId,
    });

    return successResponse({
      success: true,
      data,
      recommendedKeepaliveMs: 15_000,
      streamReferenceExamples: body.action === 'create' || body.streamId
        ? {
            latestFrame: `ovs://streams/${String(data.id ?? body.streamId)}?frame_index=-1`,
            recentMotion: `ovs://streams/${String(data.id ?? body.streamId)}?start_offset_ms=-5000&max_fps=1`,
          }
        : null,
    });
  } catch (error) {
    console.error('[overshoot-stream] Error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    const message = error instanceof Error ? error.message : 'Overshoot stream action failed';
    return errorResponse(message, 500);
  }
});
