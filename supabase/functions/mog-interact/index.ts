import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { MogAuthError, authenticateMogRequest } from '../_shared/mog-auth.ts';

const supabaseUrl = 'https://ixkkrousepsiorwlaycp.supabase.co';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PAYOUTS = {
  view: 1,
  like: 5,
  comment: 10,
  share: 3,
  bookmark: 2,
};

const DAILY_PAYOUT_LIMIT = 100;
const COMMENT_COOLDOWN_SECONDS = 20;
const DAILY_COMMENT_LIMIT = 50;

function authErrorResponse(error: MogAuthError): Response {
  const details = {
    ...(error.hint ? { hint: error.hint } : {}),
    ...(error.details || {}),
  };
  return errorResponse(error.code, error.status, Object.keys(details).length ? details : null);
}

async function checkDailyPayouts(supabase: any, payerWallet: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('engagement_payouts')
    .select('id', { count: 'exact', head: true })
    .eq('payer_wallet', payerWallet)
    .gte('created_at', today.toISOString())
    .eq('status', 'confirmed');

  return count || 0;
}

async function checkDuplicateAction(supabase: any, payerWallet: string, contentId: string, actionType: string): Promise<boolean> {
  const table = actionType === 'like'
    ? 'mog_likes'
    : actionType === 'bookmark'
      ? 'mog_bookmarks'
      : null;

  if (!table) return false;

  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('user_wallet', payerWallet)
    .eq('post_id', contentId)
    .single();

  return Boolean(data);
}

async function checkCommentRateLimit(
  supabase: any,
  userWallet: string,
): Promise<{ allowed: boolean; retryAfter?: number; dailyRemaining?: number }> {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: dailyCount } = await supabase
    .from('mog_comments')
    .select('id', { count: 'exact', head: true })
    .eq('user_wallet', userWallet)
    .gte('created_at', today.toISOString());

  if ((dailyCount || 0) >= DAILY_COMMENT_LIMIT) {
    return { allowed: false, dailyRemaining: 0 };
  }

  const cooldownStart = new Date(now.getTime() - COMMENT_COOLDOWN_SECONDS * 1000);
  const { data: recentComment } = await supabase
    .from('mog_comments')
    .select('created_at')
    .eq('user_wallet', userWallet)
    .gte('created_at', cooldownStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (recentComment) {
    const timeSince = (now.getTime() - new Date(recentComment.created_at).getTime()) / 1000;
    return {
      allowed: false,
      retryAfter: Math.ceil(COMMENT_COOLDOWN_SECONDS - timeSince),
      dailyRemaining: DAILY_COMMENT_LIMIT - (dailyCount || 0),
    };
  }

  return { allowed: true, dailyRemaining: DAILY_COMMENT_LIMIT - (dailyCount || 0) };
}

async function triggerPayout(
  supabase: any,
  creatorWallet: string,
  payerWallet: string,
  contentId: string,
  contentType: string,
  actionType: string,
  amount: number,
) {
  if (creatorWallet === payerWallet) return null;

  const dailyPayouts = await checkDailyPayouts(supabase, payerWallet);
  if (dailyPayouts >= DAILY_PAYOUT_LIMIT) return null;

  const { data: payout, error } = await supabase
    .from('engagement_payouts')
    .insert({
      content_id: contentId,
      content_type: contentType,
      action_type: actionType,
      creator_wallet: creatorWallet,
      payer_wallet: payerWallet,
      amount,
      status: 'confirmed',
    })
    .select()
    .single();

  if (error) {
    console.error('Payout insert error:', error);
    return null;
  }

  return payout;
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
    const body = await req.json();
    const { action_type, content_id, comment } = body;

    if (!action_type || !['like', 'comment', 'view', 'share', 'bookmark'].includes(action_type)) {
      return errorResponse('action_type must be like, comment, view, share, or bookmark', 400);
    }

    if (!content_id || typeof content_id !== 'string') {
      return errorResponse('content_id is required', 400);
    }

    const { data: post, error: postError } = await supabase
      .from('mog_posts')
      .select('id, creator_wallet, likes_count, comments_count, views_count, shares_count, bookmarks_count')
      .eq('id', content_id)
      .single();

    if (postError || !post) {
      return errorResponse('Post not found', 404);
    }

    await supabase
      .from('mog_agent_profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', agent.id);

    let message = '';
    let payout = null;

    switch (action_type) {
      case 'like': {
        const isDuplicate = await checkDuplicateAction(supabase, agent.wallet_address, content_id, 'like');
        if (isDuplicate) {
          return errorResponse('Already liked this post', 409);
        }

        await supabase.from('mog_likes').insert({
          post_id: content_id,
          user_wallet: agent.wallet_address,
        });

        await supabase.rpc('increment_mog_post_likes', { post_id: content_id, increment_by: 1 });

        message = 'Liked! 🦞';
        payout = await triggerPayout(supabase, post.creator_wallet, agent.wallet_address, content_id, 'post', 'like', PAYOUTS.like);
        break;
      }

      case 'comment': {
        if (!comment || typeof comment !== 'string' || comment.length < 1 || comment.length > 1000) {
          return errorResponse('Comment must be 1-1000 characters', 400);
        }

        const rateLimit = await checkCommentRateLimit(supabase, agent.wallet_address);
        if (!rateLimit.allowed) {
          return errorResponse(
            rateLimit.retryAfter
              ? `Comment cooldown: wait ${rateLimit.retryAfter} seconds`
              : 'Daily comment limit reached',
            429,
            { retry_after_seconds: rateLimit.retryAfter, daily_remaining: rateLimit.dailyRemaining },
          );
        }

        await supabase.from('mog_comments').insert({
          post_id: content_id,
          user_wallet: agent.wallet_address,
          content: comment,
          likes_count: 0,
        });

        await supabase.rpc('increment_mog_post_comments', { post_id: content_id, increment_by: 1 });

        message = 'Commented! 🦞';
        payout = await triggerPayout(supabase, post.creator_wallet, agent.wallet_address, content_id, 'post', 'comment', PAYOUTS.comment);
        break;
      }

      case 'view': {
        await supabase.rpc('increment_mog_post_views', { post_id: content_id, increment_by: 1 });
        message = 'View recorded!';
        payout = await triggerPayout(supabase, post.creator_wallet, agent.wallet_address, content_id, 'post', 'view', PAYOUTS.view);
        break;
      }

      case 'share': {
        await supabase
          .from('mog_posts')
          .update({ shares_count: (post.shares_count || 0) + 1 })
          .eq('id', content_id);

        message = 'Shared! 🦞';
        payout = await triggerPayout(supabase, post.creator_wallet, agent.wallet_address, content_id, 'post', 'share', PAYOUTS.share);
        break;
      }

      case 'bookmark': {
        const isDuplicate = await checkDuplicateAction(supabase, agent.wallet_address, content_id, 'bookmark');
        if (isDuplicate) {
          return errorResponse('Already bookmarked this post', 409);
        }

        await supabase.from('mog_bookmarks').insert({
          post_id: content_id,
          user_wallet: agent.wallet_address,
        });

        await supabase
          .from('mog_posts')
          .update({ bookmarks_count: (post.bookmarks_count || 0) + 1 })
          .eq('id', content_id);

        message = 'Bookmarked! 🦞';
        payout = await triggerPayout(supabase, post.creator_wallet, agent.wallet_address, content_id, 'post', 'bookmark', PAYOUTS.bookmark);
        break;
      }
    }

    const { data: author } = await supabase
      .from('mog_agent_profiles')
      .select('name')
      .eq('wallet_address', post.creator_wallet)
      .single();

    return successResponse({
      success: true,
      auth_mode,
      message,
      author: author ? { name: author.name } : null,
      payout: payout ? { amount: payout.amount, token: '$5DEE' } : null,
    });
  } catch (error) {
    if (error instanceof MogAuthError) {
      return authErrorResponse(error);
    }

    console.error('Error in mog-interact:', error);
    return errorResponse('Internal server error', 500);
  }
});
