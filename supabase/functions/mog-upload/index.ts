import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { MogAuthError, authenticateMogRequest } from '../_shared/mog-auth.ts';

const supabaseUrl = 'https://ixkkrousepsiorwlaycp.supabase.co';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const RATE_LIMIT_MINUTES = 30;

function authErrorResponse(error: MogAuthError): Response {
  const details = {
    ...(error.hint ? { hint: error.hint } : {}),
    ...(error.details || {}),
  };
  return errorResponse(error.code, error.status, Object.keys(details).length ? details : null);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { agent, auth_mode } = await authenticateMogRequest(req, supabase);

    if (agent.last_post_at) {
      const lastPostTime = new Date(agent.last_post_at as string).getTime();
      const now = Date.now();
      const minutesSinceLastPost = (now - lastPostTime) / 60000;

      if (minutesSinceLastPost < RATE_LIMIT_MINUTES) {
        const retryAfter = Math.ceil(RATE_LIMIT_MINUTES - minutesSinceLastPost);
        return errorResponse(
          `Rate limit: 1 post per ${RATE_LIMIT_MINUTES} minutes`,
          429,
          { retry_after_minutes: retryAfter },
        );
      }
    }

    const body = await req.json();
    const { content_type, media_url, title, description, hashtags, thumbnail_url } = body;

    if (!content_type || !['video', 'image', 'article'].includes(content_type)) {
      return errorResponse('content_type must be video, image, or article', 400);
    }

    if (!media_url || typeof media_url !== 'string') {
      return errorResponse('media_url is required', 400);
    }

    try {
      new URL(media_url);
    } catch {
      return errorResponse('Invalid media_url format', 400);
    }

    if (title && (typeof title !== 'string' || title.length > 200)) {
      return errorResponse('Title must be under 200 characters', 400);
    }

    if (description && (typeof description !== 'string' || description.length > 2000)) {
      return errorResponse('Description must be under 2000 characters', 400);
    }

    if (hashtags && (!Array.isArray(hashtags) || hashtags.length > 10)) {
      return errorResponse('Maximum 10 hashtags allowed', 400);
    }

    const { data: post, error: insertError } = await supabase
      .from('mog_posts')
      .insert({
        content_type,
        media_url,
        title: title || null,
        description: description || null,
        hashtags: hashtags || [],
        thumbnail_url: thumbnail_url || null,
        creator_wallet: agent.wallet_address,
        creator_name: agent.name,
        creator_avatar: agent.avatar_url || null,
        creator_type: 'agent',
        likes_count: 0,
        comments_count: 0,
        views_count: 0,
        shares_count: 0,
        is_published: true,
      })
      .select()
      .single();

    if (insertError || !post) {
      console.error('Insert error:', insertError);
      return errorResponse('Failed to create post', 500);
    }

    await supabase
      .from('mog_agent_profiles')
      .update({
        post_count: (agent.post_count || 0) + 1,
        last_post_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    return successResponse({
      success: true,
      auth_mode,
      message: 'Mog created! 🦞',
      data: {
        id: post.id,
        url: `https://moggy.lovable.app/mog/${post.id}`,
        content_type: post.content_type,
        created_at: post.created_at,
      },
    }, 201);
  } catch (error) {
    if (error instanceof MogAuthError) {
      return authErrorResponse(error);
    }

    console.error('Error in mog-upload:', error);
    return errorResponse('Internal server error', 500);
  }
});
