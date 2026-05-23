import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IPVaultItem, IPVaultSourceType } from '@/types/ip-vault';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
  assetGetById: vi.fn(),
  getBlueprint: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
    },
    from: mocks.from,
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

vi.mock('@/services/assetService', () => ({
  assetService: {
    getById: mocks.assetGetById,
  },
}));

vi.mock('@/services/characterBlueprintService', () => ({
  getBlueprint: mocks.getBlueprint,
}));

import { ipVaultService } from '@/services/ipVaultService';

const now = '2026-05-04T14:00:00.000Z';
const existingVaultRows = new Map<string, any>();
const finalAssetRows = new Map<string, any>();
const generationRows = new Map<string, any>();
const insertedPayloads: any[] = [];

function sourceKey(sourceType: string, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

function makeVaultRow(overrides: Partial<IPVaultItem> & Record<string, unknown> = {}) {
  return {
    id: 'vault-1',
    user_id: 'user-1',
    project_id: 'project-1',
    source_type: 'project_asset',
    source_id: 'asset-1',
    asset_kind: 'image',
    title: 'Hero Asset',
    description: null,
    media_url: 'https://cdn.example.com/hero.png',
    thumbnail_url: 'https://cdn.example.com/hero-thumb.png',
    media_type: 'image/png',
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
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createIpVaultBuilder() {
  const filters: Record<string, unknown> = {};
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({
      data: existingVaultRows.get(sourceKey(String(filters.source_type), String(filters.source_id))) ?? null,
      error: null,
    })),
    insert: vi.fn((payload: any) => {
      insertedPayloads.push(payload);
      const inserted = makeVaultRow({
        id: `vault-${insertedPayloads.length}`,
        ...payload,
      });
      existingVaultRows.set(sourceKey(inserted.source_type, inserted.source_id), inserted);
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: inserted, error: null })),
        })),
      };
    }),
  };
  return builder;
}

function createRowByIdBuilder(rows: Map<string, any>) {
  const filters: Record<string, unknown> = {};
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({
      data: rows.get(String(filters.id)) ?? null,
      error: null,
    })),
  };
  return builder;
}

describe('ipVaultService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existingVaultRows.clear();
    finalAssetRows.clear();
    generationRows.clear();
    insertedPayloads.length = 0;
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'access-token' } },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'ip_vault_items') return createIpVaultBuilder();
      if (table === 'final_project_assets') return createRowByIdBuilder(finalAssetRows);
      if (table === 'generation_outputs') return createRowByIdBuilder(generationRows);
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it.each([
    {
      sourceType: 'project_asset' as IPVaultSourceType,
      sourceId: 'asset-1',
      setup: () => {
        mocks.assetGetById.mockResolvedValue({
          id: 'asset-1',
          project_id: 'project-1',
          asset_type: 'image',
          asset_category: 'character',
          original_file_name: 'nova.png',
          file_name: 'nova.png',
          mime_type: 'image/png',
          cdn_url: 'https://cdn.example.com/nova.png',
          preview_url: null,
          thumbnail_url: 'https://cdn.example.com/nova-thumb.png',
          storage_bucket: 'assets',
          storage_path: 'nova.png',
          media_metadata: { description: 'Hero portrait' },
        });
      },
      expected: {
        title: 'nova.png',
        asset_kind: 'character',
        project_id: 'project-1',
        media_url: 'https://cdn.example.com/nova.png',
      },
    },
    {
      sourceType: 'final_project_asset' as IPVaultSourceType,
      sourceId: 'final-1',
      setup: () => {
        finalAssetRows.set('final-1', {
          id: 'final-1',
          project_id: 'project-2',
          asset_type: 'video',
          file_url: 'https://cdn.example.com/final.mp4',
          duration_ms: 12_000,
          file_size: 42,
          storage_bucket: 'exports',
          storage_path: 'final.mp4',
          metadata: {
            name: 'Final Trailer',
            description: 'Locked export',
            asset_subtype: 'trailer',
            thumbnail_url: 'https://cdn.example.com/final-thumb.jpg',
          },
        });
      },
      expected: {
        title: 'Final Trailer',
        asset_kind: 'trailer',
        project_id: 'project-2',
        media_url: 'https://cdn.example.com/final.mp4',
      },
    },
    {
      sourceType: 'character_blueprint' as IPVaultSourceType,
      sourceId: 'blueprint-1',
      setup: () => {
        mocks.getBlueprint.mockResolvedValue({
          id: 'blueprint-1',
          projectId: 'project-3',
          kind: 'character',
          name: 'Nova Pilot',
          slug: 'nova-pilot',
          promptFragment: 'CHARACTER ANCHOR: Nova Pilot',
          imageUrl: 'https://cdn.example.com/blueprint.png',
          thumbnailUrl: 'https://cdn.example.com/blueprint-thumb.png',
          referenceImageUrls: [],
          traits: {},
          faceDetails: {},
          bodyDetails: {},
          styleDetails: {},
          referenceAssetIds: [],
          gmiElementId: null,
        });
      },
      expected: {
        title: 'Nova Pilot',
        asset_kind: 'character',
        project_id: 'project-3',
        media_url: 'https://cdn.example.com/blueprint.png',
      },
    },
    {
      sourceType: 'generation_output' as IPVaultSourceType,
      sourceId: 'output-1',
      setup: () => {
        generationRows.set('output-1', {
          id: 'output-1',
          project_id: 'project-4',
          output_type: 'video',
          prompt: 'A rain-soaked rooftop chase',
          output_url: 'https://cdn.example.com/output.mp4',
          thumbnail_url: 'https://cdn.example.com/output-thumb.jpg',
          model: 'veo',
        });
      },
      expected: {
        title: 'A rain-soaked rooftop chase',
        asset_kind: 'video',
        project_id: 'project-4',
        media_url: 'https://cdn.example.com/output.mp4',
      },
    },
  ])('finalizes $sourceType sources into vault items', async ({ sourceType, sourceId, setup, expected }) => {
    setup();

    const item = await ipVaultService.finalizeSource({ sourceType, sourceId });

    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0]).toMatchObject({
      user_id: 'user-1',
      source_type: sourceType,
      source_id: sourceId,
      story_network: 'aeneid',
      registration_status: 'draft',
      ...expected,
    });
    expect(item).toMatchObject({
      source_type: sourceType,
      source_id: sourceId,
      ...expected,
    });
  });

  it('returns an existing vault item instead of duplicating a finalized source', async () => {
    const existing = makeVaultRow({
      id: 'vault-existing',
      source_type: 'project_asset',
      source_id: 'asset-1',
      title: 'Already Finalized',
    });
    existingVaultRows.set(sourceKey('project_asset', 'asset-1'), existing);

    const item = await ipVaultService.finalizeSource({
      sourceType: 'project_asset',
      sourceId: 'asset-1',
    });

    expect(item.id).toBe('vault-existing');
    expect(item.title).toBe('Already Finalized');
    expect(insertedPayloads).toHaveLength(0);
    expect(mocks.assetGetById).not.toHaveBeenCalled();
  });

  it('invokes the authenticated Story metadata pinning edge function', async () => {
    const pinnedRow = makeVaultRow({
      id: 'vault-1',
      ip_metadata_uri: 'ipfs://ip-metadata',
      ip_metadata_hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      nft_metadata_uri: 'ipfs://nft-metadata',
      nft_metadata_hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      media_hash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      registration_status: 'metadata_ready',
    });
    mocks.invoke.mockResolvedValue({
      data: {
        item: pinnedRow,
        mediaIpfsUri: 'ipfs://media',
        mediaHash: pinnedRow.media_hash,
        ipMetadataUri: pinnedRow.ip_metadata_uri,
        ipMetadataHash: pinnedRow.ip_metadata_hash,
        nftMetadataUri: pinnedRow.nft_metadata_uri,
        nftMetadataHash: pinnedRow.nft_metadata_hash,
      },
      error: null,
    });

    const result = await ipVaultService.pinStoryMetadata('vault-1');

    expect(mocks.invoke).toHaveBeenCalledWith('story-ipfs-metadata', {
      body: { itemId: 'vault-1' },
      headers: {
        Authorization: 'Bearer access-token',
      },
    });
    expect(result.item.registration_status).toBe('metadata_ready');
    expect(result.ipMetadataUri).toBe('ipfs://ip-metadata');
  });
});
