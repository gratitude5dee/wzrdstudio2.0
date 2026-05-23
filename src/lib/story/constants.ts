import { defineChain } from 'thirdweb/chains';

export const STORY_AENEID_CHAIN_ID = 1315;
export const STORY_AENEID_RPC_URL = 'https://aeneid.storyrpc.io';
export const STORY_AENEID_EXPLORER_URL = 'https://aeneid.storyscan.io';
export const STORY_DEFAULT_SPG_NFT_CONTRACT =
  (import.meta.env.VITE_STORY_AENEID_SPG_NFT_CONTRACT as string | undefined) ??
  '0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc';

export const ROYALTY_POLICY_LAP_ADDRESS = '0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E';
export const ROYALTY_POLICY_LRP_ADDRESS = '0x9156e603C949481883B1d3355c6f1132D191fC41';

export const storyAeneidThirdwebChain = defineChain({
  id: STORY_AENEID_CHAIN_ID,
  name: 'Story Aeneid',
  nativeCurrency: {
    name: 'IP',
    symbol: 'IP',
    decimals: 18,
  },
  rpc: STORY_AENEID_RPC_URL,
  blockExplorers: [
    {
      name: 'StoryScan',
      url: STORY_AENEID_EXPLORER_URL,
    },
  ],
  testnet: true,
});

export function getStoryExplorerIpUrl(ipId: string): string {
  return `${STORY_AENEID_EXPLORER_URL}/ipa/${ipId}`;
}

export function ipfsUriToGatewayUrl(uri?: string | null): string | null {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`;
  }
  return uri;
}
