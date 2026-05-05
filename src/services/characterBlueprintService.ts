// ---------------------------------------------------------------------------
// Character Blueprint — Supabase CRUD Service
// ---------------------------------------------------------------------------

import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import type { CharacterBlueprint, CharacterBlueprintImage, CharacterKind } from '@/types/character-creation';
import { toSlug } from '@/lib/stores/character-creation-store';
import { normalizeReferenceTags, type RegistryReferenceAsset } from '@/lib/referenceRegistry';
import { unifiedGenerationService } from '@/services/unifiedGenerationService';
import { getDefaultModelForTier, type UserTier } from '@/hooks/useUserTier';
import { extractGmiElementId } from '@/lib/gmiCloud';

// ---------------------------------------------------------------------------
type CharacterBlueprintRow = Database['public']['Tables']['character_blueprints']['Row'];
type CharacterBlueprintInsert = Database['public']['Tables']['character_blueprints']['Insert'];
type CharacterBlueprintUpdate = Database['public']['Tables']['character_blueprints']['Update'];
type CharacterBlueprintImageRow = Database['public']['Tables']['character_blueprint_images']['Row'];
type CharacterBlueprintImageInsert = Database['public']['Tables']['character_blueprint_images']['Insert'];

export interface BlueprintReferenceInput {
  assetId?: string | null;
  imageUrl: string;
  label?: string | null;
  generationRole?: string | null;
  generationMetadata?: Record<string, unknown>;
  isPrimary?: boolean;
}

interface ProjectSetupCharacterRow {
  id: string;
  name: string;
  project_id: string;
  description?: string | null;
  image_url?: string | null;
  anchor_asset_ids?: string[] | null;
  identity_profile?: unknown;
  consistency_summary?: unknown;
}

interface ProjectCharacterBlueprintInput {
  name: string;
  slug: string;
  kind: CharacterBlueprint['kind'];
  projectId: string;
  traits: CharacterBlueprint['traits'];
  faceDetails: CharacterBlueprint['faceDetails'];
  bodyDetails: CharacterBlueprint['bodyDetails'];
  styleDetails: CharacterBlueprint['styleDetails'];
  promptFragment: string;
  tags: string[];
  imageUrl: string | null;
  thumbnailUrl: string | null;
  referenceImages: BlueprintReferenceInput[];
}

interface BlueprintReferenceSummary {
  referenceAssetIds: string[];
  referenceImageUrls: string[];
  referenceAssets: RegistryReferenceAsset[];
}

function toJson(value: unknown): Json {
  return (value ?? {}) as Json;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeKind(value: string | null | undefined): CharacterKind {
  if (
    value === 'character' ||
    value === 'object' ||
    value === 'creature' ||
    value === 'vehicle' ||
    value === 'environment' ||
    value === 'location'
  ) {
    return value;
  }
  return 'character';
}

function normalizeLocationMetadata(value: unknown): CharacterBlueprint['locationMetadata'] {
  const metadata = asRecord(value);
  if (Object.keys(metadata).length === 0) {
    return undefined;
  }

  return {
    placeName: asString(metadata.place_name) ?? asString(metadata.placeName),
    address: asString(metadata.address),
    lat: asNumber(metadata.lat),
    lng: asNumber(metadata.lng),
    placeId: asString(metadata.place_id) ?? asString(metadata.placeId),
    source: asString(metadata.source),
  };
}

function inferReferenceAssetType(url: string): RegistryReferenceAsset['type'] {
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  if (/\.(glb|gltf|obj|fbx|usdz)$/.test(path)) return 'model';
  if (/\.(mp4|mov|webm|m4v)$/.test(path)) return 'video';
  return 'image';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function compactText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

export function buildProjectCharacterBlueprintInput(character: ProjectSetupCharacterRow): ProjectCharacterBlueprintInput {
  const identityProfile = asRecord(character.identity_profile);
  const consistencySummary = asRecord(character.consistency_summary);
  const visualPrompt =
    asString(identityProfile.visual_prompt) ??
    asString(identityProfile.visualPrompt) ??
    asString(consistencySummary.visual_prompt) ??
    asString(consistencySummary.visualPrompt);
  const promptFragment = compactText([
    character.description,
    visualPrompt,
    asString(consistencySummary.summary),
  ]) || character.name;
  const tags = normalizeReferenceTags(asStringArray(identityProfile.tags));
  const imageUrl = asString(character.image_url);
  const anchorAssetIds = asStringArray(character.anchor_asset_ids);

  return {
    name: character.name,
    slug: toSlug(character.name),
    kind: 'character',
    projectId: character.project_id,
    traits: {},
    faceDetails: {},
    bodyDetails: {},
    styleDetails: {
      customPrompt: visualPrompt ?? undefined,
    },
    promptFragment,
    tags,
    imageUrl,
    thumbnailUrl: imageUrl,
    referenceImages: imageUrl
      ? [{
          assetId: anchorAssetIds[0] ?? null,
          imageUrl,
          label: 'Project setup reference',
          generationRole: 'primary',
          generationMetadata: {
            source: 'project_setup',
            characterId: character.id,
          },
          isPrimary: true,
        }]
      : [],
  };
}

function summarizeReferences(images: CharacterBlueprintImage[]): BlueprintReferenceSummary {
  const referenceAssetIds = Array.from(
    new Set(images.map((image) => image.assetId).filter((assetId): assetId is string => Boolean(assetId))),
  );
  const referenceImageUrls = Array.from(
    new Set(images.map((image) => image.imageUrl).filter(Boolean)),
  );
  const referenceAssets = images.map((image) => ({
    assetId: image.assetId ?? undefined,
    url: image.imageUrl,
    type: inferReferenceAssetType(image.imageUrl),
    role: image.generationRole ?? image.label ?? (image.isPrimary ? 'primary' : 'reference'),
  }));

  return { referenceAssetIds, referenceImageUrls, referenceAssets };
}

function attachReferenceSummary(
  blueprint: CharacterBlueprint,
  images: CharacterBlueprintImage[],
): CharacterBlueprint {
  return {
    ...blueprint,
    ...summarizeReferences(images),
  };
}

async function listBlueprintImagesForBlueprints(blueprintIds: string[]): Promise<Map<string, CharacterBlueprintImage[]>> {
  const map = new Map<string, CharacterBlueprintImage[]>();
  if (blueprintIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from('character_blueprint_images')
    .select('*')
    .in('blueprint_id', blueprintIds)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  for (const row of data ?? []) {
    const image = rowToImage(row);
    const current = map.get(image.blueprintId) ?? [];
    current.push(image);
    map.set(image.blueprintId, current);
  }

  return map;
}

// Row ↔ Domain mapping helpers
// ---------------------------------------------------------------------------

export function rowToBlueprint(row: CharacterBlueprintRow & Record<string, any>, references: BlueprintReferenceSummary = {
  referenceAssetIds: [],
  referenceImageUrls: [],
  referenceAssets: [],
}): CharacterBlueprint {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id ?? null,
    name: row.name,
    slug: row.slug,
    kind: normalizeKind(row.kind),
    traits: (row.traits as CharacterBlueprint['traits']) ?? {},
    faceDetails: (row.face_details as CharacterBlueprint['faceDetails']) ?? {},
    bodyDetails: (row.body_details as CharacterBlueprint['bodyDetails']) ?? {},
    styleDetails: (row.style_details as CharacterBlueprint['styleDetails']) ?? {},
    promptFragment: row.prompt_fragment ?? '',
    tags: normalizeReferenceTags(row.tags),
    locationMetadata: normalizeLocationMetadata(row.location_metadata),
    imageUrl: row.image_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    referenceAssetIds: references.referenceAssetIds,
    referenceImageUrls: references.referenceImageUrls,
    referenceAssets: references.referenceAssets,
    gmiElementId: row.gmi_element_id ?? null,
    gmiElementRequestId: row.gmi_element_request_id ?? null,
    gmiElementStatus: row.gmi_element_status ?? null,
    gmiElementError: row.gmi_element_error ?? null,
    gmiElementUpdatedAt: row.gmi_element_updated_at ?? null,
    isFavorite: row.is_favorite ?? false,
    usageCount: row.usage_count ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

export function rowToImage(row: CharacterBlueprintImageRow & Record<string, any>): CharacterBlueprintImage {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    assetId: row.asset_id ?? null,
    imageUrl: row.image_url,
    label: row.label ?? null,
    generationRole: row.generation_role ?? row.variant ?? null,
    generationMetadata: asRecord(row.generation_metadata ?? row.generation_params),
    isPrimary: row.is_primary ?? false,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// List all blueprints for the current user
// ---------------------------------------------------------------------------

export async function listBlueprints(): Promise<CharacterBlueprint[]> {
  const { data, error } = await supabase
    .from('character_blueprints')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = data ?? [];
  const referencesByBlueprint = await listBlueprintImagesForBlueprints(rows.map((row) => row.id));
  return rows.map((row) =>
    rowToBlueprint(row, summarizeReferences(referencesByBlueprint.get(row.id) ?? [])),
  );
}

// ---------------------------------------------------------------------------
// Get a single blueprint by ID
// ---------------------------------------------------------------------------

export async function getBlueprint(id: string): Promise<CharacterBlueprint | null> {
  const { data, error } = await supabase
    .from('character_blueprints')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const referencesByBlueprint = await listBlueprintImagesForBlueprints([data.id]);
  return rowToBlueprint(data, summarizeReferences(referencesByBlueprint.get(data.id) ?? []));
}

// ---------------------------------------------------------------------------
// Create a new blueprint
// ---------------------------------------------------------------------------

export async function createBlueprint(input: {
  name: string;
  kind: CharacterBlueprint['kind'];
  traits: CharacterBlueprint['traits'];
  faceDetails: CharacterBlueprint['faceDetails'];
  bodyDetails: CharacterBlueprint['bodyDetails'];
  styleDetails: CharacterBlueprint['styleDetails'];
  promptFragment: string;
  tags?: string[];
  locationMetadata?: CharacterBlueprint['locationMetadata'];
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  projectId?: string | null;
  referenceImages?: BlueprintReferenceInput[];
}): Promise<CharacterBlueprint> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const slug = toSlug(input.name);
  const primaryReference = input.referenceImages?.find((image) => image.isPrimary) ?? input.referenceImages?.[0];

  const { data, error } = await supabase
    .from('character_blueprints')
    .insert({
      user_id: user.id,
      project_id: input.projectId ?? null,
      name: input.name,
      slug,
      kind: input.kind,
      traits: toJson(input.traits),
      face_details: toJson(input.faceDetails),
      body_details: toJson(input.bodyDetails),
      style_details: toJson(input.styleDetails),
      prompt_fragment: input.promptFragment,
      tags: normalizeReferenceTags(input.tags),
      location_metadata: toJson(input.locationMetadata),
      image_url: input.imageUrl ?? primaryReference?.imageUrl ?? null,
      thumbnail_url: input.thumbnailUrl ?? primaryReference?.imageUrl ?? null,
    } as unknown as CharacterBlueprintInsert)
    .select('*')
    .single();

  if (error) throw error;
  const blueprint = rowToBlueprint(data);

  const insertedReferences: CharacterBlueprintImage[] = [];
  for (const [index, reference] of (input.referenceImages ?? []).entries()) {
    const image = await addBlueprintImage({
      blueprintId: blueprint.id,
      assetId: reference.assetId,
      imageUrl: reference.imageUrl,
      label: reference.label ?? null,
      generationRole: reference.generationRole ?? (reference.isPrimary ?? index === 0 ? 'primary' : 'reference'),
      generationMetadata: reference.generationMetadata,
      isPrimary: reference.isPrimary ?? index === 0,
      sortOrder: index,
    });
    insertedReferences.push(image);
  }

  return attachReferenceSummary(blueprint, insertedReferences);
}

async function appendMissingReferenceImages(
  blueprint: CharacterBlueprint,
  references: BlueprintReferenceInput[],
): Promise<CharacterBlueprintImage[]> {
  const existingImages = await listBlueprintImages(blueprint.id);
  const knownUrls = new Set(existingImages.map((image) => image.imageUrl));
  const insertedImages: CharacterBlueprintImage[] = [];

  for (const [index, reference] of references.entries()) {
    if (knownUrls.has(reference.imageUrl)) continue;
    insertedImages.push(await addBlueprintImage({
      blueprintId: blueprint.id,
      assetId: reference.assetId,
      imageUrl: reference.imageUrl,
      label: reference.label ?? null,
      generationRole: reference.generationRole ?? 'reference',
      generationMetadata: reference.generationMetadata,
      isPrimary: reference.isPrimary ?? existingImages.length + insertedImages.length === 0,
      sortOrder: existingImages.length + index,
    }));
  }

  return [...existingImages, ...insertedImages];
}

export async function upsertProjectCharacterBlueprints(projectId: string): Promise<CharacterBlueprint[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { data: characters, error: charactersError } = await supabase
    .from('characters')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (charactersError) throw charactersError;

  const blueprints: CharacterBlueprint[] = [];
  for (const character of (characters ?? []) as unknown as ProjectSetupCharacterRow[]) {
    const input = buildProjectCharacterBlueprintInput(character);
    const { data: existing, error: existingError } = await supabase
      .from('character_blueprints')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', projectId)
      .eq('slug', input.slug)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const updated = await updateBlueprintRecord(existing.id, {
        name: input.name,
        kind: input.kind,
        traits: input.traits,
        faceDetails: input.faceDetails,
        bodyDetails: input.bodyDetails,
        styleDetails: input.styleDetails,
        promptFragment: input.promptFragment,
        tags: input.tags,
        imageUrl: input.imageUrl ?? existing.image_url ?? null,
        thumbnailUrl: input.thumbnailUrl ?? existing.thumbnail_url ?? null,
      });
      const images = await appendMissingReferenceImages(updated, input.referenceImages);
      blueprints.push(attachReferenceSummary(updated, images));
      continue;
    }

    blueprints.push(await createBlueprint(input));
  }

  return blueprints;
}

// ---------------------------------------------------------------------------
// Update an existing blueprint
// ---------------------------------------------------------------------------

export async function updateBlueprintRecord(
  id: string,
  updates: Partial<{
    name: string;
    kind: CharacterBlueprint['kind'];
    traits: CharacterBlueprint['traits'];
    faceDetails: CharacterBlueprint['faceDetails'];
    bodyDetails: CharacterBlueprint['bodyDetails'];
    styleDetails: CharacterBlueprint['styleDetails'];
    promptFragment: string;
    tags: string[];
    locationMetadata: CharacterBlueprint['locationMetadata'];
    imageUrl: string | null;
    thumbnailUrl: string | null;
    gmiElementId: string | null;
    gmiElementRequestId: string | null;
    gmiElementStatus: string | null;
    gmiElementError: string | null;
    gmiElementUpdatedAt: string | null;
    isFavorite: boolean;
  }>,
): Promise<CharacterBlueprint> {
  const payload: CharacterBlueprintUpdate = {};

  if (updates.name !== undefined) {
    payload.name = updates.name;
    payload.slug = toSlug(updates.name);
  }
  if (updates.kind !== undefined) payload.kind = updates.kind;
  if (updates.traits !== undefined) payload.traits = toJson(updates.traits);
  if (updates.faceDetails !== undefined) payload.face_details = toJson(updates.faceDetails);
  if (updates.bodyDetails !== undefined) payload.body_details = toJson(updates.bodyDetails);
  if (updates.styleDetails !== undefined) payload.style_details = toJson(updates.styleDetails);
  if (updates.promptFragment !== undefined) payload.prompt_fragment = updates.promptFragment;
  if (updates.tags !== undefined) (payload as any).tags = normalizeReferenceTags(updates.tags);
  if (updates.locationMetadata !== undefined) (payload as any).location_metadata = toJson(updates.locationMetadata);
  if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
  if (updates.thumbnailUrl !== undefined) payload.thumbnail_url = updates.thumbnailUrl;
  if (updates.gmiElementId !== undefined) (payload as any).gmi_element_id = updates.gmiElementId;
  if (updates.gmiElementRequestId !== undefined) (payload as any).gmi_element_request_id = updates.gmiElementRequestId;
  if (updates.gmiElementStatus !== undefined) (payload as any).gmi_element_status = updates.gmiElementStatus;
  if (updates.gmiElementError !== undefined) (payload as any).gmi_element_error = updates.gmiElementError;
  if (updates.gmiElementUpdatedAt !== undefined) (payload as any).gmi_element_updated_at = updates.gmiElementUpdatedAt;
  if (updates.isFavorite !== undefined) payload.is_favorite = updates.isFavorite;

  const { data, error } = await supabase
    .from('character_blueprints')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  const referencesByBlueprint = await listBlueprintImagesForBlueprints([data.id]);
  return rowToBlueprint(data, summarizeReferences(referencesByBlueprint.get(data.id) ?? []));
}

export async function toggleBlueprintPinned(id: string, pinned: boolean): Promise<CharacterBlueprint> {
  return updateBlueprintRecord(id, { isFavorite: pinned });
}

// ---------------------------------------------------------------------------
// Delete a blueprint
// ---------------------------------------------------------------------------

export async function deleteBlueprint(id: string): Promise<void> {
  const { error } = await supabase
    .from('character_blueprints')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Increment usage count (fire-and-forget)
// ---------------------------------------------------------------------------

export async function incrementBlueprintUsage(id: string): Promise<void> {
  // Use rpc or manual increment
  const { data: current } = await supabase
    .from('character_blueprints')
    .select('usage_count')
    .eq('id', id)
    .single();

  if (current) {
    await supabase
      .from('character_blueprints')
      .update({ usage_count: (current.usage_count ?? 0) + 1 })
      .eq('id', id);
  }
}

// ---------------------------------------------------------------------------
// Blueprint Images
// ---------------------------------------------------------------------------

export async function listBlueprintImages(blueprintId: string): Promise<CharacterBlueprintImage[]> {
  const { data, error } = await supabase
    .from('character_blueprint_images')
    .select('*')
    .eq('blueprint_id', blueprintId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToImage);
}

export async function addBlueprintImage(input: {
  blueprintId: string;
  assetId?: string | null;
  imageUrl: string;
  label?: string | null;
  generationRole?: string | null;
  generationMetadata?: Record<string, unknown>;
  isPrimary?: boolean;
  sortOrder?: number;
}): Promise<CharacterBlueprintImage> {
  const { data, error } = await supabase
    .from('character_blueprint_images')
    .insert({
      blueprint_id: input.blueprintId,
      image_url: input.imageUrl,
      label: input.label ?? null,
      generation_role: input.generationRole ?? null,
      generation_metadata: input.generationMetadata ?? {},
      is_primary: input.isPrimary ?? false,
      sort_order: input.sortOrder ?? 0,
      ...(input.assetId ? { asset_id: input.assetId } : {}),
    } as any)
    .select('*')
    .single();

  if (error) throw error;
  return rowToImage(data);
}

export async function editBlueprintImage(input: {
  blueprint: CharacterBlueprint;
  editPrompt: string;
  styleReferenceUrl?: string;
}): Promise<{ blueprint: CharacterBlueprint; image: CharacterBlueprintImage; editedImageUrl: string }> {
  const prompt = input.editPrompt.trim();
  if (!prompt) {
    throw new Error('Describe the character edit before generating.');
  }

  const sourceImageUrl = input.blueprint.imageUrl ?? input.blueprint.referenceImageUrls[0];
  if (!sourceImageUrl) {
    throw new Error('Generate or add a character image before editing.');
  }

  const { data, error } = await supabase.functions.invoke('edit-character-image', {
    body: {
      character_id: input.blueprint.id,
      source_image_url: sourceImageUrl,
      edit_prompt: prompt,
      style_reference_url: input.styleReferenceUrl,
      preferred_model: 'gmi/nanobanana-2',
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to edit character image.');
  }

  const editedImageUrl = (data as { edited_image_url?: string } | null)?.edited_image_url;
  if (!editedImageUrl) {
    throw new Error('Character image edit did not return an image URL.');
  }

  const updatedBlueprint = await updateBlueprintRecord(input.blueprint.id, {
    imageUrl: editedImageUrl,
    thumbnailUrl: editedImageUrl,
  });

  const image = await addBlueprintImage({
    blueprintId: input.blueprint.id,
    imageUrl: editedImageUrl,
    label: `Voice edit: ${prompt.slice(0, 80)}`,
    isPrimary: true,
    sortOrder: updatedBlueprint.referenceImageUrls.length,
  });

  return {
    blueprint: attachReferenceSummary(updatedBlueprint, [image]),
    image,
    editedImageUrl,
  };
}

// ---------------------------------------------------------------------------
// @Mention search — prefix match on slug
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Generate character portrait image via GMI Cloud (free tier) or Fal.ai
// ---------------------------------------------------------------------------

export async function generateCharacterImage(
  promptFragment: string,
  options?: {
    tier?: UserTier;
    projectId?: string;
    onProgress?: (progress: { percent: number; message?: string }) => void;
  },
): Promise<string | null> {
  const tier = options?.tier ?? 'free';
  const model = getDefaultModelForTier('image', tier);

  const result = await unifiedGenerationService.generateImage(
    `Portrait of ${promptFragment}. Highly detailed, professional character portrait, studio lighting, clean background.`,
    {
      model,
      projectId: options?.projectId,
      source: 'studio',
      autoStore: true,
      onProgress: options?.onProgress,
    },
  );

  if (result.status === 'completed' && result.url) {
    return result.url;
  }

  return null;
}

function getDefaultElementTagId(kind: CharacterBlueprint['kind']): string {
  switch (kind) {
    case 'character':
      return 'o_102';
    case 'creature':
      return 'o_103';
    case 'object':
    case 'vehicle':
      return 'o_104';
    case 'location':
    case 'environment':
      return 'o_106';
    default:
      return 'o_108';
  }
}

export async function createReusableBlueprintElement(input: {
  blueprint: CharacterBlueprint;
  referenceImageUrls: string[];
  projectId?: string | null;
}): Promise<CharacterBlueprint> {
  const frontalImage = input.blueprint.imageUrl;
  if (!frontalImage) {
    throw new Error('Generate a portrait before creating a reusable element.');
  }

  const referImages = input.referenceImageUrls.filter(Boolean).slice(0, 3);
  if (referImages.length === 0) {
    throw new Error('Add at least one reference image before creating a reusable element.');
  }

  const now = new Date().toISOString();
  await updateBlueprintRecord(input.blueprint.id, {
    gmiElementStatus: 'queued',
    gmiElementError: null,
    gmiElementUpdatedAt: now,
  });

  const { data: submitData, error: submitError } = await supabase.functions.invoke('gmi-execute', {
    body: {
      modelId: 'gmi/kling-create-element',
      action: 'submit',
      inputs: {
        element_name: input.blueprint.name.slice(0, 20),
        element_description: input.blueprint.promptFragment.slice(0, 100) || input.blueprint.name.slice(0, 100),
        reference_type: 'image_refer',
        frontal_image: frontalImage,
        refer_images: referImages,
        tag_list: [{ tag_id: getDefaultElementTagId(input.blueprint.kind) }],
      },
      metadata: {
        source: 'studio',
        projectId: input.projectId ?? input.blueprint.projectId,
      },
    },
  });

  if (submitError) {
    await updateBlueprintRecord(input.blueprint.id, {
      gmiElementStatus: 'failed',
      gmiElementError: submitError.message,
      gmiElementUpdatedAt: new Date().toISOString(),
    });
    throw new Error(submitError.message || 'Failed to start reusable element creation.');
  }

  const requestId = (submitData as { requestId?: string } | null)?.requestId;
  if (!requestId) {
    await updateBlueprintRecord(input.blueprint.id, {
      gmiElementStatus: 'failed',
      gmiElementError: 'GMI Cloud did not return a request ID.',
      gmiElementUpdatedAt: new Date().toISOString(),
    });
    throw new Error('GMI Cloud did not return a request ID.');
  }

  await updateBlueprintRecord(input.blueprint.id, {
    gmiElementRequestId: requestId,
    gmiElementStatus: 'processing',
    gmiElementError: null,
    gmiElementUpdatedAt: new Date().toISOString(),
  });

  const maxPolls = 60;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 3000));

    const { data: pollData, error: pollError } = await supabase.functions.invoke('gmi-execute', {
      body: {
        modelId: 'gmi/kling-create-element',
        action: 'poll',
        requestId,
      },
    });

    if (pollError) {
      continue;
    }

    const payload = pollData as {
      status?: string;
      data?: Record<string, unknown>;
    } | null;
    const status = payload?.status ?? (typeof payload?.data?.status === 'string' ? payload.data.status : undefined);

    if (status === 'success') {
      const elementId = extractGmiElementId(payload?.data);
      if (!elementId) {
        break;
      }

      return await updateBlueprintRecord(input.blueprint.id, {
        gmiElementId: elementId,
        gmiElementRequestId: requestId,
        gmiElementStatus: 'success',
        gmiElementError: null,
        gmiElementUpdatedAt: new Date().toISOString(),
      });
    }

    if (status === 'failed' || status === 'cancelled') {
      const failureMessage = `Reusable element creation ${status}.`;
      await updateBlueprintRecord(input.blueprint.id, {
        gmiElementRequestId: requestId,
        gmiElementStatus: status,
        gmiElementError: failureMessage,
        gmiElementUpdatedAt: new Date().toISOString(),
      });
      throw new Error(failureMessage);
    }
  }

  await updateBlueprintRecord(input.blueprint.id, {
    gmiElementRequestId: requestId,
    gmiElementStatus: 'failed',
    gmiElementError: 'Reusable element creation timed out.',
    gmiElementUpdatedAt: new Date().toISOString(),
  });
  throw new Error('Reusable element creation timed out.');
}

// ---------------------------------------------------------------------------
// @Mention search — prefix match on slug
// ---------------------------------------------------------------------------

export async function searchBlueprintsBySlug(
  query: string,
  limit = 10,
): Promise<CharacterBlueprint[]> {
  const normalised = query.toLowerCase().replace(/^@/, '').trim();
  if (!normalised) return [];

  const { data, error } = await supabase
    .from('character_blueprints')
    .select('*')
    .ilike('slug', `${normalised}%`)
    .order('usage_count', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = data ?? [];
  const referencesByBlueprint = await listBlueprintImagesForBlueprints(rows.map((row) => row.id));
  return rows.map((row) =>
    rowToBlueprint(row, summarizeReferences(referencesByBlueprint.get(row.id) ?? [])),
  );
}
