/**
 * useUserTier – detects the current user's subscription tier and exposes
 * helpers for tier-aware model ordering.
 *
 * Tier helpers for provider ordering. GMI Cloud models still consume credits.
 */

import { useMemo } from 'react';
import { useBilling, type BillingSubscription } from '@/hooks/useBilling';

export type UserTier = 'free' | 'pro' | 'enterprise';

export interface UserTierInfo {
  /** Resolved tier for the current user */
  tier: UserTier;
  /** Whether the user is on the free plan */
  isFree: boolean;
  /** Whether the user is on a paid plan (pro or enterprise) */
  isPaid: boolean;
  /** The default AI provider presented in Studio/Kanvas */
  defaultProvider: 'gmi-cloud' | 'fal-ai';
  /** Loading state while billing data is being fetched */
  isLoading: boolean;
}

function resolveTier(subscription: BillingSubscription | null): UserTier {
  if (!subscription || subscription.status !== 'active') {
    return 'free';
  }

  const planCode = (subscription.plan_code ?? '').toLowerCase();
  if (planCode === 'free' || planCode.includes('free')) {
    return 'free';
  }
  if (planCode.includes('enterprise')) {
    return 'enterprise';
  }
  if (planCode.includes('pro') || planCode.includes('premium') || planCode.includes('team')) {
    return 'pro';
  }

  // Any other active subscription is treated as pro
  return 'pro';
}

export function useUserTier(): UserTierInfo {
  const { subscription, isLoading } = useBilling();

  return useMemo(() => {
    const tier = resolveTier(subscription);
    const isFree = tier === 'free';

    return {
      tier,
      isFree,
      isPaid: !isFree,
      defaultProvider: isFree ? 'gmi-cloud' : 'fal-ai',
      isLoading,
    };
  }, [subscription, isLoading]);
}

// ── Static helpers (for use outside React) ──────────────────────────────────

/**
 * Returns true when the given model ID belongs to the GMI Cloud provider.
 */
export function isGmiCloudModel(modelId: string): boolean {
  return modelId.startsWith('gmi/');
}

/**
 * Returns the default model ID for a given media type and tier.
 */
export function getDefaultModelForTier(
  mediaType: 'image' | 'video' | 'text' | 'audio',
  tier: UserTier
): string {
  if (tier !== 'free') {
    switch (mediaType) {
      case 'image':
        return 'fal-ai/nano-banana-pro';
      case 'video':
        return 'fal-ai/kling-video/o3/standard/text-to-video';
      case 'text':
        return 'google/gemini-2.5-flash';
      case 'audio':
        return 'fal-ai/elevenlabs/tts/turbo-v2.5';
    }
  }

  switch (mediaType) {
    case 'image':
      return 'gmi/seedream-5.0-lite';
    case 'video':
      return 'gmi/kling-v3-omni';
    case 'text':
      return 'gmi/deepseek-r1';
    case 'audio':
      return 'gmi/minime-talks-workflow';
  }
}

/**
 * Keeps GMI Cloud models first for free users while preserving legacy models.
 */
export function sortModelsForTier<T extends { id: string; provider?: string }>(
  models: T[],
  tier: UserTier
): T[] {
  if (tier !== 'free') {
    return models;
  }

  return [...models].sort((a, b) => {
    const aIsGmi = a.id.startsWith('gmi/') ? 0 : 1;
    const bIsGmi = b.id.startsWith('gmi/') ? 0 : 1;
    return aIsGmi - bIsGmi;
  });
}
