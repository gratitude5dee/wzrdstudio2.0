import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';

const WORLDLABS_BASE = 'https://api.worldlabs.ai';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // Authenticate the request
    await authenticateRequest(req.headers);

    // Retrieve WORLDLABS_API_KEY from the environment
    const apiKey = Deno.env.get('WORLDLABS_API_KEY');
    if (!apiKey) {
      return errorResponse('WORLDLABS_API_KEY not configured', 500);
    }

    // Parse and validate the request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid request body', 400);
    }

    const action = body.action as string | undefined;
    if (!action) {
      return errorResponse('action is required', 400);
    }

    const headers: Record<string, string> = {
      'WLT-Api-Key': apiKey,
      'Content-Type': 'application/json',
    };

    // Route by action
    switch (action) {
      // ----- generate -------------------------------------------------------
      case 'generate': {
        const worldPrompt: Record<string, unknown> = {
          type: 'text',
          text_prompt: body.prompt as string,
        };

        if (body.imageUrl) {
          worldPrompt.type = 'image';
          worldPrompt.image_prompt = {
            source: 'uri',
            uri: body.imageUrl,
          };
        }

        const generateBody: Record<string, unknown> = {
          display_name: body.displayName,
          world_prompt: worldPrompt,
        };

        if (body.model) {
          generateBody.model = body.model;
        }

        const response = await fetch(`${WORLDLABS_BASE}/marble/v1/worlds:generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify(generateBody),
        });

        if (!response.ok) {
          const text = await response.text();
          return errorResponse(`WorldLabs generate failed: ${text}`, response.status);
        }

        const data = await response.json();
        return successResponse(data);
      }

      // ----- poll -----------------------------------------------------------
      case 'poll': {
        const operationId = body.operationId as string;
        if (!operationId) return errorResponse('operationId is required', 400);

        const response = await fetch(
          `${WORLDLABS_BASE}/marble/v1/operations/${encodeURIComponent(operationId)}`,
          { method: 'GET', headers },
        );

        if (!response.ok) {
          const text = await response.text();
          return errorResponse(`WorldLabs poll failed: ${text}`, response.status);
        }

        const data = await response.json();
        return successResponse(data);
      }

      // ----- get ------------------------------------------------------------
      case 'get': {
        const worldId = body.worldId as string;
        if (!worldId) return errorResponse('worldId is required', 400);

        const response = await fetch(
          `${WORLDLABS_BASE}/marble/v1/worlds/${encodeURIComponent(worldId)}`,
          { method: 'GET', headers },
        );

        if (!response.ok) {
          const text = await response.text();
          return errorResponse(`WorldLabs get failed: ${text}`, response.status);
        }

        const data = await response.json();
        return successResponse(data);
      }

      // ----- list -----------------------------------------------------------
      case 'list': {
        const response = await fetch(`${WORLDLABS_BASE}/marble/v1/worlds`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          const text = await response.text();
          return errorResponse(`WorldLabs list failed: ${text}`, response.status);
        }

        const data = await response.json();
        return successResponse(data);
      }

      // ----- prepare_upload -------------------------------------------------
      case 'prepare_upload': {
        const response = await fetch(
          `${WORLDLABS_BASE}/marble/v1/media-assets:prepare_upload`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              file_name: body.fileName,
              kind: 'image',
              extension: ((body.fileName as string) ?? 'file.png').split('.').pop() ?? 'png',
            }),
          },
        );

        if (!response.ok) {
          const text = await response.text();
          return errorResponse(`WorldLabs prepare_upload failed: ${text}`, response.status);
        }

        const data = await response.json();
        return successResponse(data);
      }

      // ----- delete ---------------------------------------------------------
      case 'delete': {
        const worldId = body.worldId as string;
        if (!worldId) return errorResponse('worldId is required', 400);

        const response = await fetch(
          `${WORLDLABS_BASE}/marble/v1/worlds/${encodeURIComponent(worldId)}`,
          { method: 'DELETE', headers },
        );

        if (!response.ok) {
          const text = await response.text();
          return errorResponse(`WorldLabs delete failed: ${text}`, response.status);
        }

        return successResponse({ deleted: true });
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (error) {
    console.error('worldlabs-proxy error:', error);

    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    return errorResponse(message, 500);
  }
});
