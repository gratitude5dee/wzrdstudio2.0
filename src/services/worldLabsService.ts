import { supabase } from '@/integrations/supabase/client';
import type {
  AspectRatioType,
  GenerationModel,
  ResolutionType,
  World,
  WorldModel,
  WorldOperation,
  WorldOperationStatus,
} from '@/types/worldview';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute pixel dimensions from a base resolution and aspect ratio.
 *
 * Base widths: 512 → 512, 1K → 1024, 2K → 2048, 4K → 4096.
 * Height = Math.round(baseWidth / ratio).
 */
export function getImageSize(
  resolution: ResolutionType,
  aspectRatio: AspectRatioType,
): { width: number; height: number } {
  const baseWidths: Record<ResolutionType, number> = {
    '512': 512,
    '1K': 1024,
    '2K': 2048,
    '4K': 4096,
  };

  const ratioMap: Record<AspectRatioType, number> = {
    '16:9': 16 / 9,
    '4:3': 4 / 3,
    '1:1': 1,
    '2.39:1': 2.39,
    '9:16': 9 / 16,
  };

  const width = baseWidths[resolution];
  const ratio = ratioMap[aspectRatio];
  const height = Math.round(width / ratio);

  return { width, height };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const worldLabsService = {
  /**
   * Generate a new 3D world via the worldlabs-proxy edge function.
   */
  async generateWorld(
    prompt: string,
    displayName: string,
    model: WorldModel,
    imageUrl?: string,
  ): Promise<{ operation: WorldOperation }> {
    const { data, error } = await supabase.functions.invoke('worldlabs-proxy', {
      body: {
        action: 'generate',
        prompt,
        displayName,
        model,
        ...(imageUrl ? { imageUrl } : {}),
      },
    });

    if (error) throw new Error(error.message ?? 'Failed to generate world');

    // Map raw WorldLabs response to our internal format
    const raw = data as Record<string, unknown>;
    const operation: WorldOperation = {
      id: raw.operation_id as string,
      worldId: undefined,
      status: 'running',
      description: 'World generation started',
    };

    return { operation };
  },

  /**
   * Poll a world-generation operation until it completes or fails.
   * Calls onProgress with each status update.
   * Polls every 5 s, up to 120 attempts (10 min).
   */
  async pollOperation(
    operationId: string,
    onProgress?: (status: WorldOperationStatus, description?: string) => void,
  ): Promise<WorldOperation> {
    const MAX_ATTEMPTS = 120;
    const INTERVAL_MS = 5_000;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const { data, error } = await supabase.functions.invoke('worldlabs-proxy', {
        body: { action: 'poll', operationId },
      });

      if (error) throw new Error(error.message ?? 'Failed to poll operation');

      // Map WorldLabs API response to our internal format
      const raw = data as Record<string, unknown>;
      const metadata = raw.metadata as Record<string, unknown> | undefined;
      const progress = metadata?.progress as Record<string, unknown> | undefined;

      const statusStr = (progress?.status as string)?.toLowerCase() ?? 'pending';
      const statusMap: Record<string, WorldOperationStatus> = {
        in_progress: 'running',
        succeeded: 'completed',
        failed: 'failed',
      };
      const mappedStatus: WorldOperationStatus = statusMap[statusStr] ?? 'running';
      const description = progress?.description as string | undefined;

      const responseObj = raw.response as Record<string, unknown> | undefined;
      const operation: WorldOperation = {
        id: raw.operation_id as string,
        worldId: (metadata?.world_id as string) ?? (responseObj?.world_id as string) ?? undefined,
        status: mappedStatus,
        description,
        error: raw.error ? JSON.stringify(raw.error) : undefined,
      };

      onProgress?.(operation.status, operation.description);

      if (operation.status === 'completed' || operation.status === 'failed') {
        return operation;
      }

      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }

    throw new Error('Operation timed out');
  },

  /**
   * Retrieve a single world by ID.
   */
  async getWorld(worldId: string): Promise<World> {
    const { data, error } = await supabase.functions.invoke('worldlabs-proxy', {
      body: { action: 'get', worldId },
    });

    if (error) throw new Error(error.message ?? 'Failed to get world');

    // Map raw WorldLabs API response (snake_case) to our internal World type
    const raw = (data as Record<string, unknown>).world ?? data;
    const r = raw as Record<string, unknown>;
    const assets = r.assets as Record<string, unknown> | undefined;
    const splats = assets?.splats as Record<string, unknown> | undefined;
    const spzUrls = splats?.spz_urls as Record<string, string> | undefined;
    const imagery = assets?.imagery as Record<string, unknown> | undefined;
    const worldPrompt = r.world_prompt as Record<string, unknown> | undefined;

    return {
      id: (r.id ?? r.world_id) as string,
      displayName: (r.display_name as string) ?? '',
      model: (r.model as WorldModel) ?? 'Marble 0.1-plus',
      prompt:
        worldPrompt?.type === 'image'
          ? { kind: 'image' as const, imageUrl: '', text: (worldPrompt?.text_prompt as string) ?? '' }
          : { kind: 'text' as const, text: (worldPrompt?.text_prompt as string) ?? '' },
      assets: {
        thumbnailUrl: assets?.thumbnail_url as string | undefined,
        panoramaUrl: imagery?.pano_url as string | undefined,
        viewerUrl: r.world_marble_url as string | undefined,
        splatUrl: spzUrls?.['500k'] ?? spzUrls?.full_res,
        caption: assets?.caption as string | undefined,
      },
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
      externalId: (r.id ?? r.world_id) as string,
    };
  },

  /**
   * List all worlds for the current user.
   */
  async listWorlds(): Promise<World[]> {
    const { data, error } = await supabase.functions.invoke('worldlabs-proxy', {
      body: { action: 'list' },
    });

    if (error) throw new Error(error.message ?? 'Failed to list worlds');

    // Map each raw world entry
    const rawWorlds = ((data as Record<string, unknown>).worlds ?? []) as Record<string, unknown>[];
    return rawWorlds.map((r) => {
      const assets = r.assets as Record<string, unknown> | undefined;
      const splats = assets?.splats as Record<string, unknown> | undefined;
      const spzUrls = splats?.spz_urls as Record<string, string> | undefined;
      const imagery = assets?.imagery as Record<string, unknown> | undefined;
      const worldPrompt = r.world_prompt as Record<string, unknown> | undefined;

      return {
        id: (r.id ?? r.world_id) as string,
        displayName: (r.display_name as string) ?? '',
        model: (r.model as WorldModel) ?? 'Marble 0.1-plus',
        prompt:
          worldPrompt?.type === 'image'
            ? { kind: 'image' as const, imageUrl: '', text: (worldPrompt?.text_prompt as string) ?? '' }
            : { kind: 'text' as const, text: (worldPrompt?.text_prompt as string) ?? '' },
        assets: {
          thumbnailUrl: assets?.thumbnail_url as string | undefined,
          panoramaUrl: imagery?.pano_url as string | undefined,
          viewerUrl: r.world_marble_url as string | undefined,
          splatUrl: spzUrls?.['500k'] ?? spzUrls?.full_res,
          caption: assets?.caption as string | undefined,
        },
        createdAt: (r.created_at as string) ?? new Date().toISOString(),
        externalId: (r.id ?? r.world_id) as string,
      };
    });
  },

  /**
   * Two-step media asset upload: prepare a signed URL, then PUT the file.
   */
  async uploadMediaAsset(file: File): Promise<{ assetId: string; url: string }> {
    // Step 1 – get a signed upload URL from WorldLabs
    const { data: prepareData, error: prepareError } = await supabase.functions.invoke(
      'worldlabs-proxy',
      {
        body: {
          action: 'prepare_upload',
          fileName: file.name,
          contentType: file.type,
        },
      },
    );

    if (prepareError) throw new Error(prepareError.message ?? 'Failed to prepare upload');

    // Map WorldLabs API response shape
    const raw = prepareData as Record<string, unknown>;
    const mediaAsset = raw.media_asset as Record<string, unknown>;
    const uploadInfo = raw.upload_info as Record<string, unknown>;
    const assetId = mediaAsset.id as string;
    const uploadUrl = uploadInfo.upload_url as string;
    const requiredHeaders = (uploadInfo.required_headers as Record<string, string>) ?? {};

    // Step 2 – PUT the file to the signed URL
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { ...requiredHeaders, 'Content-Type': file.type },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}`);
    }

    return { assetId, url: uploadUrl };
  },

  /**
   * Capture the current canvas as a PNG and upload to Supabase Storage.
   * Falls back to a data-URL if the storage upload fails.
   */
  async captureTake(
    canvas: HTMLCanvasElement,
  ): Promise<string> {
    // Convert canvas to PNG blob
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas capture failed'))),
        'image/png',
      );
    });

    const fileName = `take-${Date.now()}.png`;

    try {
      const { data, error } = await supabase.storage
        .from('worldview-takes')
        .upload(fileName, blob, { contentType: 'image/png', upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('worldview-takes')
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch {
      // Fallback: return a data URL
      return canvas.toDataURL('image/png');
    }
  },

  /**
   * Generate an AI shot image via the existing fal-proxy edge function.
   * Routes the model id, builds the image_size from resolution + aspect ratio.
   */
  async generateShot(params: {
    prompt: string;
    model: GenerationModel;
    resolution: ResolutionType;
    aspectRatio: AspectRatioType;
    imageUrl?: string;
    numImages?: number;
  }): Promise<{ requestId: string; status: string; result: unknown }> {
    const imageSize = getImageSize(params.resolution, params.aspectRatio);

    // nano-banana routes to fal-ai/flux/dev as a fallback
    const endpoint =
      params.model === 'nano-banana' ? 'fal-ai/flux/dev' : params.model;

    const input: Record<string, unknown> = {
      prompt: params.prompt,
      image_size: imageSize,
      num_images: params.numImages ?? 1,
    };

    if (params.imageUrl) {
      input.image_url = params.imageUrl;
    }

    const { data, error } = await supabase.functions.invoke('fal-proxy', {
      body: { endpoint, input },
    });

    if (error) throw new Error(error.message ?? 'Failed to generate shot');
    return data as { requestId: string; status: string; result: unknown };
  },
};
