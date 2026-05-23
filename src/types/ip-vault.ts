export type IPVaultSourceType =
  | 'project_asset'
  | 'final_project_asset'
  | 'character_blueprint'
  | 'generation_output';

export type IPVaultRegistrationStatus =
  | 'draft'
  | 'metadata_ready'
  | 'registering'
  | 'registered'
  | 'failed';

export type IPVaultLicenseProfile =
  | 'none'
  | 'non_commercial_social_remix'
  | 'commercial_use'
  | 'commercial_remix'
  | 'creative_commons_attribution';

export type IPVaultRelationshipType = 'root' | 'derivative' | 'remix' | 'adaptation';

export interface IPVaultItem {
  id: string;
  user_id: string;
  project_id: string | null;
  source_type: IPVaultSourceType;
  source_id: string;
  asset_kind: string;
  title: string;
  description: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  metadata: Record<string, unknown>;
  story_network: 'aeneid' | 'mainnet' | string;
  registration_status: IPVaultRegistrationStatus;
  ip_id: string | null;
  token_id: string | null;
  nft_contract: string | null;
  tx_hash: string | null;
  story_explorer_url: string | null;
  ip_metadata_uri: string | null;
  ip_metadata_hash: string | null;
  nft_metadata_uri: string | null;
  nft_metadata_hash: string | null;
  media_hash: string | null;
  license_profile: IPVaultLicenseProfile;
  license_terms_ids: string[];
  parent_ip_ids: string[];
  relationship_type: IPVaultRelationshipType;
  royalty_policy: string | null;
  commercial_rev_share: number | null;
  minting_fee_wip: number | null;
  proof_packet: Record<string, unknown>;
  royalty_vault_address: string | null;
  last_claim_tx_hash: string | null;
  last_claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinalizeIPVaultSourceInput {
  sourceType: IPVaultSourceType;
  sourceId: string;
  title?: string;
  description?: string | null;
  assetKind?: string;
}

export interface UpdateIPVaultRightsInput {
  licenseProfile?: IPVaultLicenseProfile;
  parentIpIds?: string[];
  licenseTermsIds?: string[];
  relationshipType?: IPVaultRelationshipType;
  royaltyPolicy?: string | null;
  commercialRevShare?: number | null;
  mintingFeeWip?: number | null;
}

export interface StoryMetadataPinResult {
  item: IPVaultItem;
  mediaIpfsUri: string | null;
  mediaHash: string | null;
  ipMetadataUri: string;
  ipMetadataHash: string;
  nftMetadataUri: string;
  nftMetadataHash: string;
}
