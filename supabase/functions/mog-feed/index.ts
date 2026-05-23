import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, successResponse, errorResponse, handleCors } from '../_shared/response.ts';

const supabaseUrl = 'https://ixkkrousepsiorwlaycp.supabase.co';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const url = new URL(req.url);

  try {
    const sort = url.searchParams.get('sort') || 'new';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = supabase
      .from('mog_posts')
      .select(`
        id,
        content_type,
        media_url,
        thumbnail_url,
        title,
        description,
        hashtags,
        creator_wallet,
        likes_count,
        comments_count,
        views_count,
        shares_count,
        created_at
      `)
      .eq('is_published', true);

    // Apply sorting
    switch (sort) {
      case 'hot':
        // Hot: weighted by recent engagement (likes + comments in last 24h)
        // Using a simple formula: (likes * 2 + comments * 3 + views * 0.1) / age_hours
        query = query.order('created_at', { ascending: false });
        break;
      case 'trending':
        // Trending: highest engagement velocity
        query = query.order('likes_count', { ascending: false });
        break;
      case 'top':
        // Top: most likes all time
        query = query.order('likes_count', { ascending: false });
        break;
      case 'new':
      default:
        query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: posts, error, count } = await query;

    if (error) {
      console.error('Feed query error:', error);
      return errorResponse('Failed to fetch feed', 500);
    }

    // Fetch creator names for each post
    const creatorWallets = [...new Set(posts?.map(p => p.creator_wallet) || [])];
    
    let creatorMap: Record<string, { name: string; avatar_url: string | null }> = {};
    if (creatorWallets.length > 0) {
      const { data: creators } = await supabase
        .from('mog_agent_profiles')
        .select('wallet_address, name, avatar_url')
        .in('wallet_address', creatorWallets);
      
      if (creators) {
        creatorMap = creators.reduce((acc: Record<string, { name: string; avatar_url: string | null }>, c: any) => {
          acc[c.wallet_address] = { name: c.name, avatar_url: c.avatar_url };
          return acc;
        }, {});
      }
    }

    const enrichedPosts = (posts || []).map(post => ({
      ...post,
      creator_name: creatorMap[post.creator_wallet]?.name || 'Unknown',
      creator_avatar: creatorMap[post.creator_wallet]?.avatar_url || null,
    }));

    // For hot sorting, apply the formula after fetching
    if (sort === 'hot') {
      const now = Date.now();
      enrichedPosts.sort((a, b) => {
        const ageA = Math.max(1, (now - new Date(a.created_at).getTime()) / 3600000); // hours
        const ageB = Math.max(1, (now - new Date(b.created_at).getTime()) / 3600000);
        
        const scoreA = ((a.likes_count || 0) * 2 + (a.comments_count || 0) * 3 + (a.views_count || 0) * 0.1) / Math.pow(ageA, 1.5);
        const scoreB = ((b.likes_count || 0) * 2 + (b.comments_count || 0) * 3 + (b.views_count || 0) * 0.1) / Math.pow(ageB, 1.5);
        
        return scoreB - scoreA;
      });
    }

    // Check if there are more posts
    const { count: totalCount } = await supabase
      .from('mog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true);

    return successResponse({
      success: true,
      data: enrichedPosts,
      pagination: {
        offset,
        limit,
        count: enrichedPosts.length,
        has_more: offset + limit < (totalCount || 0),
      },
    });

  } catch (error) {
    console.error('Error in mog-feed:', error);
    return errorResponse('Internal server error', 500);
  }
});
