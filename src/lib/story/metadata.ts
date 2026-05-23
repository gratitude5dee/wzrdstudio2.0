import type { IPVaultItem } from '@/types/ip-vault';

export interface StoryMetadataCreator {
  name: string;
  address?: string | null;
  contributionPercent?: number;
}

export interface BuildStoryMetadataOptions {
  ownerAddress?: string | null;
  creators?: StoryMetadataCreator[];
  mediaIpfsUri?: string | null;
}

export interface StoryIpMetadata {
  title: string;
  description: string;
  createdAt: string;
  creators: StoryMetadataCreator[];
  image?: string;
  mediaUrl?: string;
  mediaType?: string;
  ipType: string;
  tags: string[];
  attributes: Array<{ key: string; value: string }>;
}

export interface StoryNftMetadata {
  name: string;
  description: string;
  image?: string;
  animation_url?: string;
  attributes: Array<{ trait_type: string; value: string }>;
}

export function inferStoryMediaType(item: Pick<IPVaultItem, 'media_type' | 'media_url'>): string {
  const value = item.media_type ?? item.media_url ?? '';
  if (value.startsWith('image') || /\.(png|jpe?g|gif|webp|avif)$/i.test(value)) return 'image';
  if (value.startsWith('video') || /\.(mp4|webm|mov|m4v)$/i.test(value)) return 'video';
  if (value.startsWith('audio') || /\.(mp3|wav|m4a|ogg)$/i.test(value)) return 'audio';
  return 'asset';
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue)]),
    );
  }
  return value;
}

export function buildStoryMetadata(
  item: IPVaultItem,
  options: BuildStoryMetadataOptions = {},
): { ipMetadata: StoryIpMetadata; nftMetadata: StoryNftMetadata } {
  const mediaKind = inferStoryMediaType(item);
  const mediaUri = options.mediaIpfsUri ?? item.media_url ?? undefined;
  const thumbnailUri = item.thumbnail_url ?? item.media_url ?? mediaUri;
  const description =
    item.description?.trim() ||
    `WorldStudio ${item.asset_kind} finalized from ${item.source_type.replace(/_/g, ' ')}.`;
  const creators =
    options.creators?.length
      ? options.creators
      : [
          {
            name: 'WorldStudio creator',
            address: options.ownerAddress ?? null,
            contributionPercent: 100,
          },
        ];

  const attributes = [
    { key: 'Source Type', value: item.source_type },
    { key: 'Source ID', value: item.source_id },
    { key: 'Asset Kind', value: item.asset_kind },
    { key: 'Story Network', value: item.story_network },
    { key: 'Relationship', value: item.relationship_type },
  ];

  const nftAttributes = attributes.map((attribute) => ({
    trait_type: attribute.key,
    value: attribute.value,
  }));

  const ipMetadata: StoryIpMetadata = {
    title: item.title,
    description,
    createdAt: item.created_at,
    creators,
    image: thumbnailUri ?? undefined,
    mediaUrl: mediaUri,
    mediaType: item.media_type ?? mediaKind,
    ipType: item.asset_kind || mediaKind,
    tags: ['worldstudio', item.asset_kind, mediaKind].filter(Boolean),
    attributes,
  };

  const nftMetadata: StoryNftMetadata = {
    name: item.title,
    description,
    image: thumbnailUri ?? mediaUri,
    attributes: nftAttributes,
  };

  if (mediaKind === 'video' || mediaKind === 'audio') {
    nftMetadata.animation_url = mediaUri;
  }

  return { ipMetadata, nftMetadata };
}

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto SHA-256 is not available in this runtime.');
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', (bytes as unknown) as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex0x(input: string | ArrayBuffer | Uint8Array): Promise<`0x${string}`> {
  return `0x${await sha256Hex(input)}`;
}

export async function hashStoryMetadata(metadata: unknown): Promise<`0x${string}`> {
  return sha256Hex0x(stableJsonStringify(metadata));
}
