import { describe, expect, it } from 'vitest';

import {
  buildStoryMetadata,
  hashStoryMetadata,
  inferStoryMediaType,
  stableJsonStringify,
} from '@/lib/story/metadata';
import type { IPVaultItem } from '@/types/ip-vault';

const baseItem: IPVaultItem = {
  id: 'vault-1',
  user_id: 'user-1',
  project_id: 'project-1',
  source_type: 'generation_output',
  source_id: 'output-1',
  asset_kind: 'video',
  title: 'Moonlit Chase',
  description: 'A finished chase sequence.',
  media_url: 'ipfs://media-cid',
  thumbnail_url: 'ipfs://thumb-cid',
  media_type: 'video/mp4',
  metadata: {},
  story_network: 'aeneid',
  registration_status: 'draft',
  ip_id: null,
  token_id: null,
  nft_contract: null,
  tx_hash: null,
  story_explorer_url: null,
  ip_metadata_uri: null,
  ip_metadata_hash: null,
  nft_metadata_uri: null,
  nft_metadata_hash: null,
  media_hash: null,
  license_profile: 'none',
  license_terms_ids: [],
  parent_ip_ids: [],
  relationship_type: 'root',
  royalty_policy: null,
  commercial_rev_share: null,
  minting_fee_wip: null,
  proof_packet: {},
  royalty_vault_address: null,
  last_claim_tx_hash: null,
  last_claimed_at: null,
  created_at: '2026-05-04T14:00:00.000Z',
  updated_at: '2026-05-04T14:00:00.000Z',
};

describe('Story metadata helpers', () => {
  it('maps media kinds for Story IP and NFT metadata', () => {
    const { ipMetadata, nftMetadata } = buildStoryMetadata(baseItem, {
      ownerAddress: '0x123',
    });

    expect(inferStoryMediaType(baseItem)).toBe('video');
    expect(ipMetadata).toMatchObject({
      title: 'Moonlit Chase',
      mediaUrl: 'ipfs://media-cid',
      mediaType: 'video/mp4',
      ipType: 'video',
    });
    expect(ipMetadata.creators).toEqual([
      {
        name: 'WorldStudio creator',
        address: '0x123',
        contributionPercent: 100,
      },
    ]);
    expect(nftMetadata).toMatchObject({
      name: 'Moonlit Chase',
      image: 'ipfs://thumb-cid',
      animation_url: 'ipfs://media-cid',
    });
  });

  it('hashes stable metadata JSON independent of object key order', async () => {
    const left = { b: 2, a: { d: 4, c: 3 } };
    const right = { a: { c: 3, d: 4 }, b: 2 };

    expect(stableJsonStringify(left)).toBe(stableJsonStringify(right));
    await expect(hashStoryMetadata(left)).resolves.toMatch(/^0x[a-f0-9]{64}$/);
    await expect(hashStoryMetadata(left)).resolves.toBe(await hashStoryMetadata(right));
  });
});
