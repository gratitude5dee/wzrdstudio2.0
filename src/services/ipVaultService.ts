import { supabase as typedSupabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { assetService } from '@/services/assetService';
import { getBlueprint } from '@/services/characterBlueprintService';
import type {
  FinalizeIPVaultSourceInput,
  IPVaultItem,
  IPVaultLicenseProfile,
  IPVaultRelationshipType,
  IPVaultSourceType,
  StoryMetadataPinResult,
  UpdateIPVaultRightsInput,
} from '@/types/ip-vault';

const supabase = typedSupabase as any;

interface VaultSourceSnapshot {
  projectId: string | null;
  assetKind: string;
  title: string;
  description: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  metadata: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSourceType(value: string): IPVaultSourceType {
  if (
    value === 'project_asset' ||
    value === 'final_project_asset' ||
    value === 'character_blueprint' ||
    value === 'generation_output'
  ) {
    return value;
  }
  return 'project_asset';
}

function normalizeLicenseProfile(value: string | null | undefined): IPVaultLicenseProfile {
  if (
    value === 'none' ||
    value === 'non_commercial_social_remix' ||
    value === 'commercial_use' ||
    value === 'commercial_remix' ||
    value === 'creative_commons_attribution'
  ) {
    return value;
  }
  return 'none';
}

function normalizeRelationshipType(value: string | null | undefined): IPVaultRelationshipType {
  if (value === 'derivative' || value === 'remix' || value === 'adaptation') {
    return value;
  }
  return 'root';
}

function normalizeVaultRow(row: any): IPVaultItem {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id ?? null,
    source_type: normalizeSourceType(row.source_type),
    source_id: row.source_id,
    asset_kind: row.asset_kind ?? 'asset',
    title: row.title,
    description: row.description ?? null,
    media_url: row.media_url ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    media_type: row.media_type ?? null,
    metadata: asRecord(row.metadata),
    story_network: row.story_network ?? 'aeneid',
    registration_status: row.registration_status ?? 'draft',
    ip_id: row.ip_id ?? null,
    token_id: row.token_id ?? null,
    nft_contract: row.nft_contract ?? null,
    tx_hash: row.tx_hash ?? null,
    story_explorer_url: row.story_explorer_url ?? null,
    ip_metadata_uri: row.ip_metadata_uri ?? null,
    ip_metadata_hash: row.ip_metadata_hash ?? null,
    nft_metadata_uri: row.nft_metadata_uri ?? null,
    nft_metadata_hash: row.nft_metadata_hash ?? null,
    media_hash: row.media_hash ?? null,
    license_profile: normalizeLicenseProfile(row.license_profile),
    license_terms_ids: asStringArray(row.license_terms_ids),
    parent_ip_ids: asStringArray(row.parent_ip_ids),
    relationship_type: normalizeRelationshipType(row.relationship_type),
    royalty_policy: row.royalty_policy ?? null,
    commercial_rev_share: asNumberOrNull(row.commercial_rev_share),
    minting_fee_wip: asNumberOrNull(row.minting_fee_wip),
    proof_packet: asRecord(row.proof_packet),
    royalty_vault_address: row.royalty_vault_address ?? null,
    last_claim_tx_hash: row.last_claim_tx_hash ?? null,
    last_claimed_at: row.last_claimed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Authentication required');
  return user.id;
}

function mediaKindFromType(value: string | null | undefined): string {
  if (!value) return 'asset';
  if (value.startsWith('image') || value === 'image') return 'image';
  if (value.startsWith('video') || value === 'video') return 'video';
  if (value.startsWith('audio') || value === 'audio') return 'audio';
  return value;
}

async function resolveProjectAsset(sourceId: string): Promise<VaultSourceSnapshot> {
  const asset = await assetService.getById(sourceId);
  if (!asset) throw new Error('Source asset was not found.');
  const metadata = asRecord(asset.media_metadata);
  const mediaUrl = asset.cdn_url ?? asset.preview_url ?? asset.thumbnail_url ?? null;
  return {
    projectId: asset.project_id ?? null,
    assetKind: String(asset.asset_category ?? asset.asset_type ?? 'asset'),
    title: asset.original_file_name || asset.file_name || 'Untitled asset',
    description: asString(metadata.description),
    mediaUrl,
    thumbnailUrl: asset.thumbnail_url ?? asset.preview_url ?? mediaUrl,
    mediaType: asset.mime_type || asset.asset_type,
    metadata: {
      ...metadata,
      fileName: asset.file_name,
      originalFileName: asset.original_file_name,
      assetType: asset.asset_type,
      assetCategory: asset.asset_category,
      storageBucket: asset.storage_bucket,
      storagePath: asset.storage_path,
    },
  };
}

async function resolveFinalProjectAsset(sourceId: string): Promise<VaultSourceSnapshot> {
  const { data, error } = await supabase
    .from('final_project_assets')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Final project asset was not found.');

  const metadata = asRecord(data.metadata);
  const assetType = asString(data.asset_type) ?? 'asset';
  const mediaUrl = asString(data.file_url) ?? asString(metadata.url);
  return {
    projectId: data.project_id ?? null,
    assetKind: asString(metadata.asset_subtype) ?? assetType,
    title: asString(metadata.name) ?? `${assetType} final asset`,
    description: asString(metadata.description),
    mediaUrl,
    thumbnailUrl: asString(metadata.thumbnail_url) ?? mediaUrl,
    mediaType: assetType,
    metadata: {
      ...metadata,
      durationMs: data.duration_ms,
      fileSize: data.file_size,
      storageBucket: data.storage_bucket,
      storagePath: data.storage_path,
    },
  };
}

async function resolveCharacterBlueprint(sourceId: string): Promise<VaultSourceSnapshot> {
  const blueprint = await getBlueprint(sourceId);
  if (!blueprint) throw new Error('Character blueprint was not found.');
  return {
    projectId: blueprint.projectId,
    assetKind: blueprint.kind === 'environment' ? 'location' : blueprint.kind,
    title: blueprint.name,
    description: blueprint.promptFragment || null,
    mediaUrl: blueprint.imageUrl ?? blueprint.referenceImageUrls[0] ?? null,
    thumbnailUrl: blueprint.thumbnailUrl ?? blueprint.imageUrl ?? blueprint.referenceImageUrls[0] ?? null,
    mediaType: 'image',
    metadata: {
      slug: blueprint.slug,
      promptFragment: blueprint.promptFragment,
      traits: blueprint.traits,
      faceDetails: blueprint.faceDetails,
      bodyDetails: blueprint.bodyDetails,
      styleDetails: blueprint.styleDetails,
      referenceAssetIds: blueprint.referenceAssetIds,
      referenceImageUrls: blueprint.referenceImageUrls,
      gmiElementId: blueprint.gmiElementId ?? null,
    },
  };
}

async function resolveGenerationOutput(sourceId: string): Promise<VaultSourceSnapshot> {
  const { data, error } = await supabase
    .from('generation_outputs')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Generation output was not found.');

  const mediaType = asString(data.output_type) ?? 'asset';
  return {
    projectId: data.project_id ?? null,
    assetKind: mediaKindFromType(mediaType),
    title: asString(data.prompt)?.slice(0, 90) ?? `${mediaType} generation`,
    description: asString(data.prompt),
    mediaUrl: asString(data.output_url),
    thumbnailUrl: asString(data.thumbnail_url) ?? asString(data.output_url),
    mediaType,
    metadata: {
      prompt: data.prompt,
      model: data.model,
      outputType: data.output_type,
    },
  };
}

async function resolveSourceSnapshot(input: FinalizeIPVaultSourceInput): Promise<VaultSourceSnapshot> {
  switch (input.sourceType) {
    case 'project_asset':
      return resolveProjectAsset(input.sourceId);
    case 'final_project_asset':
      return resolveFinalProjectAsset(input.sourceId);
    case 'character_blueprint':
      return resolveCharacterBlueprint(input.sourceId);
    case 'generation_output':
      return resolveGenerationOutput(input.sourceId);
  }
}

function buildInitialProofPacket(input: FinalizeIPVaultSourceInput, source: VaultSourceSnapshot) {
  return {
    finalizedAt: new Date().toISOString(),
    source: {
      type: input.sourceType,
      id: input.sourceId,
      projectId: source.projectId,
    },
    media: {
      url: source.mediaUrl,
      thumbnailUrl: source.thumbnailUrl,
      type: source.mediaType,
    },
    story: {
      network: 'aeneid',
      status: 'draft',
    },
  };
}

function toJsonRecord(value: Record<string, unknown>): Json {
  return value as Json;
}

export const ipVaultService = {
  async list(filters: { projectId?: string | null; status?: string; search?: string } = {}): Promise<IPVaultItem[]> {
    let query = supabase
      .from('ip_vault_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('registration_status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;

    let items = (data ?? []).map(normalizeVaultRow);
    if (filters.search?.trim()) {
      const search = filters.search.trim().toLowerCase();
      items = items.filter((item) =>
        `${item.title} ${item.description ?? ''} ${item.asset_kind}`.toLowerCase().includes(search),
      );
    }
    return items;
  },

  async get(itemId: string): Promise<IPVaultItem | null> {
    const { data, error } = await supabase
      .from('ip_vault_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();

    if (error) throw error;
    return data ? normalizeVaultRow(data) : null;
  },

  async finalizeSource(input: FinalizeIPVaultSourceInput): Promise<IPVaultItem> {
    const userId = await requireUserId();
    const existing = await this.findBySource(input.sourceType, input.sourceId);
    if (existing) return existing;

    const source = await resolveSourceSnapshot(input);
    const payload = {
      user_id: userId,
      project_id: source.projectId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      asset_kind: input.assetKind?.trim() || source.assetKind || mediaKindFromType(source.mediaType),
      title: input.title?.trim() || source.title,
      description: input.description !== undefined ? input.description : source.description,
      media_url: source.mediaUrl,
      thumbnail_url: source.thumbnailUrl,
      media_type: source.mediaType,
      metadata: toJsonRecord(source.metadata),
      story_network: 'aeneid',
      registration_status: 'draft',
      proof_packet: toJsonRecord(buildInitialProofPacket(input, source)),
    };

    const { data, error } = await supabase
      .from('ip_vault_items')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const duplicate = await this.findBySource(input.sourceType, input.sourceId);
        if (duplicate) return duplicate;
      }
      throw error;
    }

    return normalizeVaultRow(data);
  },

  async findBySource(sourceType: IPVaultSourceType, sourceId: string): Promise<IPVaultItem | null> {
    const { data, error } = await supabase
      .from('ip_vault_items')
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .maybeSingle();

    if (error) throw error;
    return data ? normalizeVaultRow(data) : null;
  },

  async update(itemId: string, updates: Partial<IPVaultItem>): Promise<IPVaultItem> {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) payload[key] = value;
    }

    const { data, error } = await supabase
      .from('ip_vault_items')
      .update(payload)
      .eq('id', itemId)
      .select('*')
      .single();

    if (error) throw error;
    return normalizeVaultRow(data);
  },

  async updateRights(itemId: string, input: UpdateIPVaultRightsInput): Promise<IPVaultItem> {
    return this.update(itemId, {
      license_profile: input.licenseProfile,
      license_terms_ids: input.licenseTermsIds,
      parent_ip_ids: input.parentIpIds,
      relationship_type: input.relationshipType,
      royalty_policy: input.royaltyPolicy,
      commercial_rev_share: input.commercialRevShare,
      minting_fee_wip: input.mintingFeeWip,
    } as Partial<IPVaultItem>);
  },

  async markRegistering(itemId: string): Promise<IPVaultItem> {
    return this.update(itemId, { registration_status: 'registering' });
  },

  async markRegistrationFailed(itemId: string, message: string): Promise<IPVaultItem> {
    const current = await this.get(itemId);
    return this.update(itemId, {
      registration_status: 'failed',
      proof_packet: {
        ...(current?.proof_packet ?? {}),
        registrationError: message,
        failedAt: new Date().toISOString(),
      },
    } as Partial<IPVaultItem>);
  },

  async persistRegistration(
    itemId: string,
    result: {
      ipId: string;
      tokenId?: string | null;
      nftContract?: string | null;
      txHash?: string | null;
      storyExplorerUrl?: string | null;
      licenseTermsIds?: string[];
      royaltyVaultAddress?: string | null;
    },
  ): Promise<IPVaultItem> {
    const current = await this.get(itemId);
    return this.update(itemId, {
      registration_status: 'registered',
      ip_id: result.ipId,
      token_id: result.tokenId ?? null,
      nft_contract: result.nftContract ?? current?.nft_contract ?? null,
      tx_hash: result.txHash ?? null,
      story_explorer_url: result.storyExplorerUrl ?? null,
      license_terms_ids: result.licenseTermsIds ?? current?.license_terms_ids ?? [],
      royalty_vault_address: result.royaltyVaultAddress ?? null,
      proof_packet: {
        ...(current?.proof_packet ?? {}),
        story: {
          network: current?.story_network ?? 'aeneid',
          status: 'registered',
          ipId: result.ipId,
          tokenId: result.tokenId ?? null,
          nftContract: result.nftContract ?? null,
          txHash: result.txHash ?? null,
          explorerUrl: result.storyExplorerUrl ?? null,
          royaltyVaultAddress: result.royaltyVaultAddress ?? null,
        },
        registeredAt: new Date().toISOString(),
      },
    } as Partial<IPVaultItem>);
  },

  async pinStoryMetadata(itemId: string): Promise<StoryMetadataPinResult> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('No active session. Please sign in again.');
    }

    const { data, error } = await supabase.functions.invoke('story-ipfs-metadata', {
      body: { itemId },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) throw error;
    if (!data?.item) throw new Error('Metadata pinning returned no vault item.');

    return {
      ...data,
      item: normalizeVaultRow(data.item),
    } as StoryMetadataPinResult;
  },
};
