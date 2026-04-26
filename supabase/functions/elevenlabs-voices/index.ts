import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/response.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // Authenticate the request
    await authenticateRequest(req.headers);

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

    if (!ELEVENLABS_API_KEY) {
      return errorResponse('ElevenLabs API key not configured', 500);
    }

    const { action, name, description, audioBase64, audioFileName } = await req.json();

    if (action === 'list') {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch voices from ElevenLabs');
      }

      const data = await response.json();

      return successResponse({ voices: data.voices });
    }

    if (action === 'clone') {
      if (!name || !audioBase64 || !audioFileName) {
        return errorResponse('Missing required fields: name, audioBase64, audioFileName', 400);
      }

      // Decode base64 audio to binary
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Determine MIME type from file extension
      const ext = audioFileName.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';

      // Build multipart form data for ElevenLabs API
      const formData = new FormData();
      formData.append('name', name);
      if (description) {
        formData.append('description', description);
      }
      formData.append('files', new Blob([bytes], { type: mimeType }), audioFileName);
      formData.append('remove_background_noise', 'true');

      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData?.detail?.message || errorData?.detail || 'Failed to clone voice';
        throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      }

      const data = await response.json();

      // Fetch the newly created voice details
      const voiceResponse = await fetch(`https://api.elevenlabs.io/v1/voices/${data.voice_id}`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      });

      let voice = null;
      if (voiceResponse.ok) {
        voice = await voiceResponse.json();
      }

      return successResponse({
        success: true,
        voice_id: data.voice_id,
        voice,
      });
    }

    return errorResponse('Unknown action', 400);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return errorResponse(message, 500);
  }
});
