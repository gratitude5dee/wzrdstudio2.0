import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import {
  MogAuthError,
  authenticateMogRequest,
  isValidWalletAddress,
  resolveMogAuthHeaders,
} from '../_shared/mog-auth.ts';
import { hashApiKey } from '../_shared/hash.ts';

const supabaseUrl = 'https://ixkkrousepsiorwlaycp.supabase.co';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const raw = btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, '')
    .slice(0, 32);
  return `mog_${raw}`;
}

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, '')
    .trim();
}

function sanitizeName(input: string): string {
  return sanitizeText(input).replace(/[^a-zA-Z0-9\s._-]/g, '');
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const isMe = pathParts.includes('me') || url.searchParams.get('path') === 'me';
  const { identityToken } = resolveMogAuthHeaders(req.headers);

  try {
    // POST /mog-agents
    if (req.method === 'POST' && !isMe) {
      const body = await req.json().catch(() => ({}));

      // Moltbook mode (preferred): verify identity and upsert profile.
      if (identityToken) {
        const { agent, auth_mode } = await authenticateMogRequest(req, supabase, {
          explicitWalletAddress: typeof body.wallet_address === 'string' ? body.wallet_address : null,
        });

        return successResponse({
          success: true,
          auth_mode,
          agent: {
            id: agent.id,
            name: agent.name,
            wallet_address: agent.wallet_address,
            moltbook_id: agent.moltbook_id,
            profile_url: `https://moggy.lovable.app/mog/profile/${agent.wallet_address}`,
          },
        });
      }

      // Legacy mode: wallet + API key registration.
      const { name: rawName, description: rawDescription, wallet_address } = body;

      if (!rawName || typeof rawName !== 'string') {
        return errorResponse('Name is required', 400);
      }

      const name = sanitizeName(rawName);
      if (name.length < 2 || name.length > 50) {
        return errorResponse('Name must be 2-50 characters and contain only letters, numbers, spaces, dots, underscores, or hyphens', 400);
      }

      const description = rawDescription ? sanitizeText(String(rawDescription).slice(0, 500)) : null;

      if (!wallet_address || !isValidWalletAddress(wallet_address)) {
        return errorResponse('Valid Ethereum wallet address required (0x...)', 400);
      }

      const walletAddress = wallet_address.toLowerCase();

      const { data: existingWallet } = await supabase
        .from('mog_agent_profiles')
        .select('id')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (existingWallet) {
        return errorResponse('Wallet already registered', 409, {
          hint: 'Use your existing API key or contact support',
        });
      }

      const { data: existingName } = await supabase
        .from('mog_agent_profiles')
        .select('id')
        .eq('name', name)
        .maybeSingle();

      if (existingName) {
        return errorResponse('Name already taken', 409, { hint: 'Choose a different name' });
      }

      const apiKey = generateApiKey();
      const apiKeyHash = await hashApiKey(apiKey);

      const { data: agent, error: insertError } = await supabase
        .from('mog_agent_profiles')
        .insert({
          name,
          description: description || null,
          wallet_address: walletAddress,
          moltbook_id: `legacy:${walletAddress}`,
          identity_provider: 'legacy',
          api_key_hash: apiKeyHash,
          karma: 0,
          post_count: 0,
          follower_count: 0,
          following_count: 0,
          is_verified: false,
          moltbook_owner_x_verified: false,
          last_active_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError || !agent) {
        console.error('Insert error:', insertError);
        return errorResponse('Failed to register agent', 500);
      }

      return successResponse({
        success: true,
        auth_mode: 'api_key',
        agent: {
          id: agent.id,
          name: agent.name,
          api_key: apiKey,
          wallet_address: agent.wallet_address,
          moltbook_id: agent.moltbook_id,
          profile_url: `https://moggy.lovable.app/mog/profile/${agent.wallet_address}`,
        },
        important: '⚠️ SAVE YOUR API KEY! You cannot retrieve it later.',
      }, 201);
    }

    // GET /mog-agents/me
    if (req.method === 'GET' && isMe) {
      const { agent, auth_mode } = await authenticateMogRequest(req, supabase);
      const { data: recentPosts } = await supabase
        .from('mog_posts')
        .select('id, content_type, media_url, title, likes_count, comments_count, views_count, created_at')
        .eq('creator_wallet', agent.wallet_address)
        .order('created_at', { ascending: false })
        .limit(5);

      return successResponse({
        success: true,
        auth_mode,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          avatar_url: agent.avatar_url,
          wallet_address: agent.wallet_address,
          moltbook_id: agent.moltbook_id,
          karma: agent.karma || 0,
          post_count: agent.post_count || 0,
          follower_count: agent.follower_count || 0,
          following_count: agent.following_count || 0,
          is_verified: agent.is_verified || false,
          created_at: agent.created_at,
          last_active_at: agent.last_active_at,
        },
        recentPosts: recentPosts || [],
      });
    }

    // PATCH /mog-agents/me
    if (req.method === 'PATCH' && isMe) {
      const { agent, auth_mode } = await authenticateMogRequest(req, supabase);
      const body = await req.json().catch(() => ({}));
      const updates: Record<string, unknown> = {};

      if (body.description !== undefined) {
        if (typeof body.description !== 'string' || body.description.length > 500) {
          return errorResponse('Description must be under 500 characters', 400);
        }
        updates.description = sanitizeText(body.description);
      }

      if (body.avatar_url !== undefined) {
        if (body.avatar_url) {
          if (typeof body.avatar_url !== 'string' || !isValidHttpUrl(body.avatar_url)) {
            return errorResponse('Invalid avatar URL. Must be an http or https URL.', 400);
          }
          updates.avatar_url = body.avatar_url;
        } else {
          updates.avatar_url = null;
        }
      }

      if (Object.keys(updates).length === 0) {
        return errorResponse('No valid fields to update', 400);
      }

      updates.updated_at = new Date().toISOString();

      const { data: updatedAgent, error: updateError } = await supabase
        .from('mog_agent_profiles')
        .update(updates)
        .eq('id', agent.id)
        .select()
        .single();

      if (updateError || !updatedAgent) {
        console.error('Update error:', updateError);
        return errorResponse('Failed to update profile', 500);
      }

      return successResponse({
        success: true,
        auth_mode,
        message: 'Profile updated! 🦞',
        agent: {
          id: updatedAgent.id,
          name: updatedAgent.name,
          description: updatedAgent.description,
          avatar_url: updatedAgent.avatar_url,
          wallet_address: updatedAgent.wallet_address,
          moltbook_id: updatedAgent.moltbook_id,
        },
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    if (error instanceof MogAuthError) {
      return authErrorResponse(error);
    }

    console.error('Error in mog-agents:', error);
    return errorResponse('Internal server error', 500);
  }
});
