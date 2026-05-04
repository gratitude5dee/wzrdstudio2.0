import { useCallback, useMemo, useState } from 'react';
import { StoryClient, type StoryConfig } from '@story-protocol/core-sdk';
import { viemAdapter } from 'thirdweb/adapters/viem';
import { useActiveAccount, useActiveWallet, useActiveWalletChain, useSwitchActiveWalletChain } from 'thirdweb/react';
import { http } from 'viem';

import {
  STORY_AENEID_CHAIN_ID,
  STORY_AENEID_RPC_URL,
  storyAeneidThirdwebChain,
} from '@/lib/story/constants';
import { getThirdwebClient } from '@/lib/thirdweb/client';

export interface StoryWalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isOnAeneid: boolean;
  isSwitching: boolean;
  error: string | null;
  switchToAeneid: () => Promise<void>;
  createStoryClient: () => Promise<StoryClient>;
}

export function useStoryProtocolClient(): StoryWalletState {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const chain = useActiveWalletChain();
  const switchActiveWalletChain = useSwitchActiveWalletChain();
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chainId = chain?.id ?? null;
  const isOnAeneid = chainId === STORY_AENEID_CHAIN_ID;

  const switchToAeneid = useCallback(async () => {
    setError(null);
    setIsSwitching(true);
    try {
      await switchActiveWalletChain(storyAeneidThirdwebChain);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch wallet to Story Aeneid.';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSwitching(false);
    }
  }, [switchActiveWalletChain]);

  const createStoryClient = useCallback(async () => {
    if (!account?.address || !wallet) {
      throw new Error('Connect a wallet before registering IP.');
    }
    if (!isOnAeneid) {
      throw new Error('Switch your wallet to Story Aeneid before registering IP.');
    }

    const thirdwebClient = await getThirdwebClient();
    const walletClient = viemAdapter.wallet.toViem({
      wallet,
      client: thirdwebClient,
      chain: storyAeneidThirdwebChain,
    });

    const config: StoryConfig = {
      chainId: 'aeneid',
      transport: http(STORY_AENEID_RPC_URL),
      wallet: walletClient as any,
      account: (walletClient.account?.address ?? account.address) as `0x${string}`,
    };

    return StoryClient.newClient(config);
  }, [account?.address, isOnAeneid, wallet]);

  return useMemo(
    () => ({
      address: account?.address ?? null,
      chainId,
      isConnected: Boolean(account?.address && wallet),
      isOnAeneid,
      isSwitching,
      error,
      switchToAeneid,
      createStoryClient,
    }),
    [
      account?.address,
      chainId,
      createStoryClient,
      error,
      isOnAeneid,
      isSwitching,
      switchToAeneid,
      wallet,
    ],
  );
}
