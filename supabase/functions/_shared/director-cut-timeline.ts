export const DEFAULT_IMAGE_DURATION_MS = 5000;
export const DEFAULT_VIDEO_DURATION_MS = 6000;

export interface DirectorCutSceneRow {
  id: string;
  scene_number: number | null;
}

export interface DirectorCutShotRow {
  id: string;
  scene_id: string | null;
  shot_number: number | null;
  image_url: string | null;
  upscaled_image_url?: string | null;
  video_url: string | null;
  audio_url: string | null;
  audio_status?: string | null;
  image_status?: string | null;
  video_status?: string | null;
  prompt_idea?: string | null;
  visual_prompt?: string | null;
  dialogue?: string | null;
  sound_effects?: string | null;
}

export interface ProjectVisualAssetRow {
  id: string;
  type?: string | null;
  asset_type?: string | null;
  asset_category?: string | null;
  processing_status?: string | null;
  is_archived?: boolean | null;
  url?: string | null;
  cdn_url?: string | null;
  preview_url?: string | null;
  thumbnail_url?: string | null;
  metadata?: Record<string, unknown> | null;
  media_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface MissingShotDetail {
  shotId: string;
  sceneId: string | null;
  sceneNumber: number | null;
  shotNumber: number | null;
  orderIndex?: number;
  reason: string;
  imageStatus?: string | null;
  videoStatus?: string | null;
}

export interface DirectorCutSummary {
  totalShots: number;
  syncedAssets: number;
  visualAssets: number;
  readyShots: number;
  readyVideos: number;
  fallbackImages: number;
  missingShots: number;
  missingShotDetails: MissingShotDetail[];
  audioAssets: number;
  canExport: boolean;
  blockingReason: string | null;
  exportMode: 'blocked' | 'complete' | 'available_content';
  isCompleteCut: boolean;
  skippedShotCount: number;
}

export interface ShotFailureInfo {
  assetId: string;
  orderIndex: number;
  reason: string;
  shotId?: string;
  sceneNumber?: number | null;
  shotNumber?: number | null;
}

export interface TimelineBuildResult {
  rowsToInsert: Record<string, unknown>[];
  summary: DirectorCutSummary;
  skippedShotFailures: ShotFailureInfo[];
}

type VisualSource =
  | 'shot_video_url'
  | 'project_asset_video'
  | 'shot_upscaled_image_url'
  | 'shot_image_url'
  | 'project_asset_image';

interface ShotVisualSelection {
  type: 'image' | 'video';
  url: string;
  source: VisualSource;
  projectAssetId?: string | null;
  thumbnailUrl?: string | null;
}

interface ProjectAssetByShot {
  image?: ProjectVisualAssetRow;
  video?: ProjectVisualAssetRow;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const asAssetType = (asset: ProjectVisualAssetRow): 'image' | 'video' | null => {
  const value = asString(asset.type) ?? asString(asset.asset_type);
  return value === 'image' || value === 'video' ? value : null;
};

const assetMetadata = (asset: ProjectVisualAssetRow): Record<string, unknown> => ({
  ...asRecord(asset.media_metadata),
  ...asRecord(asset.metadata),
});

const assetShotId = (asset: ProjectVisualAssetRow): string | null => {
  const metadata = assetMetadata(asset);
  return asString(metadata.shot_id) ?? asString(metadata.shotId);
};

const assetUrl = (asset: ProjectVisualAssetRow): string | null =>
  asString(asset.cdn_url) ??
  asString(asset.url) ??
  asString(asset.preview_url) ??
  asString(assetMetadata(asset).url) ??
  asString(assetMetadata(asset).public_url) ??
  asString(assetMetadata(asset).publicUrl);

const createdAtMs = (asset: ProjectVisualAssetRow): number => {
  const createdAt = asString(asset.created_at);
  if (!createdAt) return 0;
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildProjectAssetLookup = (assets: ProjectVisualAssetRow[]): Map<string, ProjectAssetByShot> => {
  const lookup = new Map<string, ProjectAssetByShot>();
  const newestFirst = [...assets].sort((a, b) => createdAtMs(b) - createdAtMs(a));

  for (const asset of newestFirst) {
    if (asset.asset_category && asset.asset_category !== 'generated') continue;
    if (asset.processing_status && asset.processing_status !== 'completed') continue;
    if (asset.is_archived === true) continue;

    const shotId = assetShotId(asset);
    const type = asAssetType(asset);
    if (!shotId || !type || !assetUrl(asset)) continue;

    const bucket = lookup.get(shotId) ?? {};
    if (!bucket[type]) {
      bucket[type] = asset;
      lookup.set(shotId, bucket);
    }
  }

  return lookup;
};

const selectShotVisual = (
  shot: DirectorCutShotRow,
  assetLookup: Map<string, ProjectAssetByShot>
): ShotVisualSelection | null => {
  const linkedAssets = assetLookup.get(shot.id);
  const linkedVideoUrl = linkedAssets?.video ? assetUrl(linkedAssets.video) : null;
  const linkedImageUrl = linkedAssets?.image ? assetUrl(linkedAssets.image) : null;

  if (asString(shot.video_url)) {
    return { type: 'video', url: asString(shot.video_url)!, source: 'shot_video_url', thumbnailUrl: shot.image_url };
  }

  if (linkedVideoUrl) {
    return {
      type: 'video',
      url: linkedVideoUrl,
      source: 'project_asset_video',
      projectAssetId: linkedAssets?.video?.id ?? null,
      thumbnailUrl: linkedAssets?.video?.thumbnail_url ?? shot.image_url,
    };
  }

  if (asString(shot.upscaled_image_url)) {
    return {
      type: 'image',
      url: asString(shot.upscaled_image_url)!,
      source: 'shot_upscaled_image_url',
      thumbnailUrl: shot.upscaled_image_url ?? shot.image_url,
    };
  }

  if (asString(shot.image_url)) {
    return { type: 'image', url: asString(shot.image_url)!, source: 'shot_image_url', thumbnailUrl: shot.image_url };
  }

  if (linkedImageUrl) {
    return {
      type: 'image',
      url: linkedImageUrl,
      source: 'project_asset_image',
      projectAssetId: linkedAssets?.image?.id ?? null,
      thumbnailUrl: linkedAssets?.image?.thumbnail_url ?? linkedImageUrl,
    };
  }

  return null;
};

const buildBlockingReason = (input: { totalShots: number; visualAssets: number }) => {
  if (input.totalShots === 0) {
    return "No ordered shots are available for Director's Cut.";
  }
  if (input.visualAssets === 0) {
    return "No generated shot image or video assets are available for Director's Cut.";
  }
  return null;
};

export const buildDirectorCutSummary = (input: {
  totalShots: number;
  syncedAssets: number;
  readyVideos: number;
  fallbackImages: number;
  missingShotDetails: MissingShotDetail[];
  audioAssets: number;
}): DirectorCutSummary => {
  const visualAssets = input.readyVideos + input.fallbackImages;
  const missingShots = input.missingShotDetails.length;
  const canExport = input.totalShots > 0 && visualAssets > 0;
  const exportMode = !canExport ? 'blocked' : missingShots > 0 ? 'available_content' : 'complete';

  return {
    totalShots: input.totalShots,
    syncedAssets: input.syncedAssets,
    visualAssets,
    readyShots: visualAssets,
    readyVideos: input.readyVideos,
    fallbackImages: input.fallbackImages,
    missingShots,
    missingShotDetails: input.missingShotDetails,
    audioAssets: input.audioAssets,
    canExport,
    blockingReason: canExport ? null : buildBlockingReason({ totalShots: input.totalShots, visualAssets }),
    exportMode,
    isCompleteCut: exportMode === 'complete',
    skippedShotCount: missingShots,
  };
};

export const missingShotDetailsToFailures = (missingShotDetails: MissingShotDetail[]): ShotFailureInfo[] =>
  missingShotDetails.map((detail, index) => ({
    assetId: detail.shotId,
    orderIndex: detail.orderIndex ?? index,
    shotId: detail.shotId,
    sceneNumber: detail.sceneNumber,
    shotNumber: detail.shotNumber,
    reason: detail.reason,
  }));

export const buildDirectorCutTimeline = (input: {
  projectId: string;
  userId: string;
  scenes: DirectorCutSceneRow[];
  shots: DirectorCutShotRow[];
  projectVisualAssets?: ProjectVisualAssetRow[];
  finalAudioAssets?: Array<{
    id: string;
    file_url: string | null;
    duration_ms: number | null;
    metadata: Record<string, unknown> | null;
  }>;
}): TimelineBuildResult => {
  const assetLookup = buildProjectAssetLookup(input.projectVisualAssets ?? []);
  let sequenceIndex = 0;
  let timelineMs = 0;
  let readyVideos = 0;
  let fallbackImages = 0;
  let audioAssets = 0;
  let orderedShotCount = 0;
  let orderedShotIndex = 0;
  const missingShotDetails: MissingShotDetail[] = [];
  const rowsToInsert: Record<string, unknown>[] = [];

  for (const scene of input.scenes) {
    const sceneShots = input.shots
      .filter((shot) => shot.scene_id === scene.id)
      .sort((a, b) => (a.shot_number ?? 0) - (b.shot_number ?? 0));
    orderedShotCount += sceneShots.length;

    for (const shot of sceneShots) {
      const currentOrderIndex = orderedShotIndex;
      orderedShotIndex += 1;
      const visual = selectShotVisual(shot, assetLookup);

      if (!visual) {
        missingShotDetails.push({
          shotId: shot.id,
          sceneId: shot.scene_id ?? null,
          sceneNumber: typeof scene.scene_number === 'number' ? scene.scene_number : null,
          shotNumber: typeof shot.shot_number === 'number' ? shot.shot_number : null,
          orderIndex: currentOrderIndex,
          reason: 'Missing shot image or video',
          imageStatus: typeof shot.image_status === 'string' ? shot.image_status : null,
          videoStatus: typeof shot.video_status === 'string' ? shot.video_status : null,
        });
        continue;
      }

      const segmentDurationMs = visual.type === 'video' ? DEFAULT_VIDEO_DURATION_MS : DEFAULT_IMAGE_DURATION_MS;

      if (visual.type === 'video') {
        readyVideos += 1;
      } else {
        fallbackImages += 1;
      }

      rowsToInsert.push({
        project_id: input.projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        position_order: sequenceIndex,
        asset_type: visual.type,
        source_url: visual.url,
        duration_ms: segmentDurationMs,
        metadata: {
          asset_role: 'shot_visual',
          start_ms: timelineMs,
          duration_ms: segmentDurationMs,
          track: 'visual',
          thumbnail_url: visual.thumbnailUrl,
          scene_number: scene.scene_number,
          shot_number: shot.shot_number,
          prompt_idea: shot.prompt_idea,
          visual_prompt: shot.visual_prompt,
          visual_source: visual.source,
          project_asset_id: visual.projectAssetId ?? null,
          fallback_image_segment: visual.type === 'image',
        },
        user_id: input.userId,
      });

      if (shot.audio_url) {
        rowsToInsert.push({
          project_id: input.projectId,
          scene_id: shot.scene_id,
          shot_id: shot.id,
          position_order: sequenceIndex,
          asset_type: 'audio',
          source_url: shot.audio_url,
          duration_ms: null,
          metadata: {
            asset_role: 'voiceover',
            start_ms: timelineMs,
            track: 'voiceover',
            scene_number: scene.scene_number,
            shot_number: shot.shot_number,
            dialogue: shot.dialogue,
            sound_effects: shot.sound_effects,
          },
          user_id: input.userId,
        });
        audioAssets += 1;
      }

      sequenceIndex += 1;
      timelineMs += segmentDurationMs;
    }
  }

  for (const asset of input.finalAudioAssets ?? []) {
    if (!asset.file_url) continue;
    rowsToInsert.push({
      project_id: input.projectId,
      scene_id: null,
      shot_id: null,
      position_order: 0,
      asset_type: 'audio',
      source_url: asset.file_url,
      duration_ms: asset.duration_ms,
      metadata: {
        ...((asset.metadata ?? {}) as Record<string, unknown>),
        asset_role: 'music',
        start_ms: 0,
        track: 'music',
        final_project_asset_id: asset.id,
      },
      user_id: input.userId,
    });
    audioAssets += 1;
  }

  return {
    rowsToInsert,
    summary: buildDirectorCutSummary({
      totalShots: orderedShotCount,
      syncedAssets: rowsToInsert.length,
      readyVideos,
      fallbackImages,
      missingShotDetails,
      audioAssets,
    }),
    skippedShotFailures: missingShotDetailsToFailures(missingShotDetails),
  };
};
