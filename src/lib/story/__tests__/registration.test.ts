import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IPVaultItem } from '@/types/ip-vault';

const sdkMocks = vi.hoisted(() => ({
  commercialUse: vi.fn((input: unknown) => ({ flavor: 'commercialUse', input })),
  commercialRemix: vi.fn((input: unknown) => ({ flavor: 'commercialRemix', input })),
  creativeCommonsAttribution: vi.fn((input: unknown) => ({ flavor: 'creativeCommonsAttribution', input })),
}));

vi.mock('@story-protocol/core-sdk', () => ({
  PILFlavor: {
    commercialUse: sdkMocks.commercialUse,
    commercialRemix: sdkMocks.commercialRemix,
    creativeCommonsAttribution: sdkMocks.creativeCommonsAttribution,
  },
  WIP_TOKEN_ADDRESS: '0x1514000000000000000000000000000000000000',
}));

import {
  assertStoryMetadataReady,
  buildLicenseTermsData,
  claimVaultRevenueOnStory,
  needsDerivativeRegistration,
  registerVaultItemOnStory,
} from '@/lib/story/registration';

const readyItem: IPVaultItem = {
  id: 'vault-1',
  user_id: 'user-1',
  project_id: 'project-1',
  source_type: 'project_asset',
  source_id: 'asset-1',
  asset_kind: 'character',
  title: 'Nova Pilot',
  description: 'Hero character.',
  media_url: 'https://cdn.example.com/nova.png',
  thumbnail_url: 'https://cdn.example.com/nova-thumb.png',
  media_type: 'image/png',
  metadata: {},
  story_network: 'aeneid',
  registration_status: 'metadata_ready',
  ip_id: null,
  token_id: null,
  nft_contract: null,
  tx_hash: null,
  story_explorer_url: null,
  ip_metadata_uri: 'ipfs://ip-metadata',
  ip_metadata_hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  nft_metadata_uri: 'ipfs://nft-metadata',
  nft_metadata_hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  media_hash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
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

function createClient() {
  return {
    ipAsset: {
      registerIpAsset: vi.fn().mockResolvedValue({
        ipId: '0x0000000000000000000000000000000000000ip1',
        tokenId: 42n,
        txHash: '0xregister',
      }),
      registerDerivativeIpAsset: vi.fn().mockResolvedValue({
        ipId: '0x0000000000000000000000000000000000000ip2',
        tokenId: 43n,
        txHash: '0xderivative',
      }),
    },
    license: {
      registerPilTermsAndAttach: vi.fn().mockResolvedValue({
        licenseTermsIds: [7n],
      }),
    },
    royalty: {
      getRoyaltyVaultAddress: vi.fn().mockResolvedValue('0x000000000000000000000000000000000000vault'),
      claimAllRevenue: vi.fn().mockResolvedValue({ txHash: '0xclaim' }),
    },
  };
}

describe('Story registration helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates that pinned Story metadata exists before registration', () => {
    expect(() => assertStoryMetadataReady(readyItem)).not.toThrow();
    expect(() =>
      assertStoryMetadataReady({
        ...readyItem,
        ip_metadata_uri: null,
      }),
    ).toThrow(/ipMetadataURI/);
  });

  it('builds license terms for the supported IP Vault presets', () => {
    expect(buildLicenseTermsData({ ...readyItem, license_profile: 'none' })).toEqual([]);
    expect(buildLicenseTermsData({ ...readyItem, license_profile: 'non_commercial_social_remix' })).toEqual([
      { licenseTermsId: 1n },
    ]);

    const remixTerms = buildLicenseTermsData({
      ...readyItem,
      license_profile: 'commercial_remix',
      commercial_rev_share: 12.5,
      minting_fee_wip: 0.25,
    });

    expect(remixTerms).toHaveLength(1);
    expect(sdkMocks.commercialRemix).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialRevShare: 12.5,
        defaultMintingFee: 250000000000000000n,
      }),
    );
  });

  it('registers root vault items through SPG minting and attaches selected license terms', async () => {
    const client = createClient();

    const result = await registerVaultItemOnStory(
      client as any,
      {
        ...readyItem,
        license_profile: 'commercial_use',
      },
      { walletAddress: '0x0000000000000000000000000000000000000001' },
    );

    expect(needsDerivativeRegistration(readyItem)).toBe(false);
    expect(client.ipAsset.registerIpAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        nft: expect.objectContaining({
          type: 'mint',
          recipient: '0x0000000000000000000000000000000000000001',
          allowDuplicates: false,
        }),
        ipMetadata: {
          ipMetadataURI: 'ipfs://ip-metadata',
          ipMetadataHash: readyItem.ip_metadata_hash,
          nftMetadataURI: 'ipfs://nft-metadata',
          nftMetadataHash: readyItem.nft_metadata_hash,
        },
      }),
    );
    expect(client.ipAsset.registerDerivativeIpAsset).not.toHaveBeenCalled();
    expect(client.license.registerPilTermsAndAttach).toHaveBeenCalledWith({
      ipId: '0x0000000000000000000000000000000000000ip1',
      licenseTermsData: expect.any(Array),
    });
    expect(result).toMatchObject({
      ipId: '0x0000000000000000000000000000000000000ip1',
      tokenId: '42',
      txHash: '0xregister',
      licenseTermsIds: ['7'],
      storyExplorerUrl: 'https://aeneid.storyscan.io/ipa/0x0000000000000000000000000000000000000ip1',
    });
  });

  it('registers derivative vault items with parent IP IDs and parent license terms', async () => {
    const client = createClient();
    const item: IPVaultItem = {
      ...readyItem,
      relationship_type: 'derivative',
      parent_ip_ids: ['0x0000000000000000000000000000000000000010'],
      license_terms_ids: ['1'],
    };

    const result = await registerVaultItemOnStory(client as any, item);

    expect(needsDerivativeRegistration(item)).toBe(true);
    expect(client.ipAsset.registerDerivativeIpAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        derivData: expect.objectContaining({
          parentIpIds: ['0x0000000000000000000000000000000000000010'],
          licenseTermsIds: [1n],
        }),
      }),
    );
    expect(client.ipAsset.registerIpAsset).not.toHaveBeenCalled();
    expect(client.license.registerPilTermsAndAttach).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ipId: '0x0000000000000000000000000000000000000ip2',
      txHash: '0xderivative',
      licenseTermsIds: ['1'],
    });
  });

  it('rejects derivative registration without parent license terms', async () => {
    const client = createClient();

    await expect(
      registerVaultItemOnStory(client as any, {
        ...readyItem,
        relationship_type: 'derivative',
        parent_ip_ids: ['0x0000000000000000000000000000000000000010'],
        license_terms_ids: [],
      }),
    ).rejects.toThrow(/parent IP IDs and parent license terms/);
    expect(client.ipAsset.registerDerivativeIpAsset).not.toHaveBeenCalled();
  });

  it('claims revenue with known child IP relationships from the proof packet', async () => {
    const client = createClient();

    const result = await claimVaultRevenueOnStory(
      client as any,
      {
        ...readyItem,
        ip_id: '0x0000000000000000000000000000000000000abc',
        proof_packet: {
          childIpIds: ['0x0000000000000000000000000000000000000def'],
        },
      },
      '0x0000000000000000000000000000000000000001',
    );

    expect(client.royalty.claimAllRevenue).toHaveBeenCalledWith(
      expect.objectContaining({
        ancestorIpId: '0x0000000000000000000000000000000000000abc',
        claimer: '0x0000000000000000000000000000000000000001',
        childIpIds: ['0x0000000000000000000000000000000000000def'],
      }),
    );
    expect(result).toEqual({ txHash: '0xclaim' });
  });
});
