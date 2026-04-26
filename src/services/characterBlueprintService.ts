// ---------------------------------------------------------------------------
// Character Blueprint — Supabase CRUD Service
// ---------------------------------------------------------------------------

import { supabase } from '@/integrations/supabase/client';
import type { CharacterBlueprint, CharacterBlueprintImage } from '@/types/character-creation';
import { toSlug } from '@/lib/stores/character-creation-store';
import { unifiedGenerationService } from '@/services/unifiedGenerationService';
import { getDefaultModelForTier, type UserTier } from '@/hooks/useUserTier';
import { extractGmiElementId } from '@/lib/gmiCloud';

// ---------------------------------------------------------------------------
// Row ↔ Domain mapping helpers
// ---------------------------------------------------------------------------

function rowToBlueprint(row: Record<string, unknown>): CharacterBlueprint {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    projectId: (row.project_id as string) ?? null,
    name: row.name as string,
    slug: row.slug as string,
    kind: (row.kind as CharacterBlueprint['kind']) ?? 'character',
    traits: (row.traits as CharacterBlueprint['traits']) ?? {},
    faceDetails: (row.face_details as CharacterBlueprint['faceDetails']) ?? {},
    bodyDetails: (row.body_details as CharacterBlueprint['bodyDetails']) ?? {},
    styleDetails: (row.style_details as CharacterBlueprint['styleDetails']) ?? {},
    promptFragment: (row.prompt_fragment as string) ?? '',
    imageUrl: (row.image_url as string) ?? null,
    thumbnailUrl: (row.thumbnail_url as string) ?? null,
    gmiElementId: (row.gmi_element_id as string) ?? null,
    gmiElementRequestId: (row.gmi_element_request_id as string) ?? null,
    gmiElementStatus: (row.gmi_element_status as string) ?? null,
    gmiElementError: (row.gmi_element_error as string) ?? null,
    gmiElementUpdatedAt: (row.gmi_element_updated_at as string) ?? null,
    isFavorite: (row.is_favorite as boolean) ?? false,
    usageCount: (row.usage_count as number) ?? 0,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

function rowToImage(row: Record<string, unknown>): CharacterBlueprintImage {
  return {
    id: row.id as string,
    blueprintId: row.blueprint_id as string,
    imageUrl: row.image_url as string,
    label: (row.label as string) ?? null,
    isPrimary: (row.is_primary as boolean) ?? false,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// List all blueprints for the current user
// ---------------------------------------------------------------------------

export async function listBlueprints(): Promise<CharacterBlueprint[]> {
  const { data, error } = await supabase
    .from('character_blueprints' as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data as unknown as Record<string, unknown>[]) ?? []).map(rowToBlueprint);
}

// ---------------------------------------------------------------------------
// Get a single blueprint by ID
// ---------------------------------------------------------------------------

export async function getBlueprint(id: string): Promise<CharacterBlueprint | null> {
  const { data, error } = await supabase
    .from('character_blueprints' as any)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToBlueprint(data as unknown as Record<string, unknown>) : null;
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
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  projectId?: string | null;
}): Promise<CharacterBlueprint> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const slug = toSlug(input.name);

  const { data, error } = await supabase
    .from('character_blueprints' as any)
    .insert({
      user_id: user.id,
      project_id: input.projectId ?? null,
      name: input.name,
      slug,
      kind: input.kind,
      traits: input.traits,
      face_details: input.faceDetails,
      body_details: input.bodyDetails,
      style_details: input.styleDetails,
      prompt_fragment: input.promptFragment,
      image_url: input.imageUrl ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
    } as any)
    .select('*')
    .single();

  if (error) throw error;
  return rowToBlueprint(data as unknown as Record<string, unknown>);
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
  const payload: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    payload.name = updates.name;
    payload.slug = toSlug(updates.name);
  }
  if (updates.kind !== undefined) payload.kind = updates.kind;
  if (updates.traits !== undefined) payload.traits = updates.traits;
  if (updates.faceDetails !== undefined) payload.face_details = updates.faceDetails;
  if (updates.bodyDetails !== undefined) payload.body_details = updates.bodyDetails;
  if (updates.styleDetails !== undefined) payload.style_details = updates.styleDetails;
  if (updates.promptFragment !== undefined) payload.prompt_fragment = updates.promptFragment;
  if (updates.imageUrl !== undefined) payload.image_url = updates.imageUrl;
  if (updates.thumbnailUrl !== undefined) payload.thumbnail_url = updates.thumbnailUrl;
  if (updates.gmiElementId !== undefined) payload.gmi_element_id = updates.gmiElementId;
  if (updates.gmiElementRequestId !== undefined) payload.gmi_element_request_id = updates.gmiElementRequestId;
  if (updates.gmiElementStatus !== undefined) payload.gmi_element_status = updates.gmiElementStatus;
  if (updates.gmiElementError !== undefined) payload.gmi_element_error = updates.gmiElementError;
  if (updates.gmiElementUpdatedAt !== undefined) payload.gmi_element_updated_at = updates.gmiElementUpdatedAt;
  if (updates.isFavorite !== undefined) payload.is_favorite = updates.isFavorite;

  const { data, error } = await supabase
    .from('character_blueprints' as any)
    .update(payload as any)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return rowToBlueprint(data as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Delete a blueprint
// ---------------------------------------------------------------------------

export async function deleteBlueprint(id: string): Promise<void> {
  const { error } = await supabase
    .from('character_blueprints' as any)
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
    .from('character_blueprints' as any)
    .select('usage_count')
    .eq('id', id)
    .single();

  if (current) {
    await supabase
      .from('character_blueprints' as any)
      .update({ usage_count: ((current as any).usage_count ?? 0) + 1 } as any)
      .eq('id', id);
  }
}

// ---------------------------------------------------------------------------
// Blueprint Images
// ---------------------------------------------------------------------------

export async function listBlueprintImages(blueprintId: string): Promise<CharacterBlueprintImage[]> {
  const { data, error } = await supabase
    .from('character_blueprint_images' as any)
    .select('*')
    .eq('blueprint_id', blueprintId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data as unknown as Record<string, unknown>[]) ?? []).map(rowToImage);
}

export async function addBlueprintImage(input: {
  blueprintId: string;
  imageUrl: string;
  label?: string;
  isPrimary?: boolean;
}): Promise<CharacterBlueprintImage> {
  const { data, error } = await supabase
    .from('character_blueprint_images' as any)
    .insert({
      blueprint_id: input.blueprintId,
      image_url: input.imageUrl,
      label: input.label ?? null,
      is_primary: input.isPrimary ?? false,
    } as any)
    .select('*')
    .single();

  if (error) throw error;
  return rowToImage(data as unknown as Record<string, unknown>);
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
    .from('character_blueprints' as any)
    .select('*')
    .ilike('slug', `${normalised}%`)
    .order('usage_count', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data as unknown as Record<string, unknown>[]) ?? []).map(rowToBlueprint);
}
