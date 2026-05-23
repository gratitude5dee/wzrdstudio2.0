import { supabase } from '@/integrations/supabase/client';
import { isDevAuthBypassEnabled } from '@/lib/devAuthBypass';
import {
  createEditorTimelineDocument,
  DEFAULT_EDITOR_COMPOSITION,
  getTimelineDurationMs,
  parseEditorTimelineDocument,
} from '@/lib/editor/timelineDocument';
import type { AudioTrack, Clip, CompositionSettings, Keyframe, LibraryMediaItem } from '@/store/videoEditorStore';

type QueryError = { message?: string };
type QueryResult<T = unknown> = { data: T | null; error: QueryError | null };
interface SupabaseQueryBuilder<T = unknown> extends PromiseLike<QueryResult<T>> {
  select: (columns?: string) => SupabaseQueryBuilder<T>;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilder<T>;
  limit: (count: number) => SupabaseQueryBuilder<T>;
  maybeSingle: () => Promise<QueryResult<T>>;
  single: () => Promise<QueryResult<T>>;
  insert: (values: unknown) => SupabaseQueryBuilder<T>;
  update: (values: unknown) => SupabaseQueryBuilder<T>;
  delete: () => SupabaseQueryBuilder<T>;
}
type UntypedSupabaseClient = {
  from: <T = unknown>(table: string) => SupabaseQueryBuilder<T>;
};

const db = supabase as unknown as UntypedSupabaseClient;

interface TimelineRecord {
  id: string;
  project_id: string;
  user_id: string;
  composition_data: unknown;
  duration_ms: number | null;
  resolution: string | null;
  frame_rate: number | null;
  updated_at?: string;
}

interface EditorTimelineState {
  clips: Clip[];
  audioTracks: AudioTrack[];
  keyframes: Keyframe[];
  composition: CompositionSettings;
}

const timelineSaveQueues = new Map<string, Promise<void>>();

const getCurrentUserId = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('You must be signed in to save editor changes.');
  }

  return user.id;
};

const getResolutionString = (composition: CompositionSettings) =>
  `${composition.width}x${composition.height}`;

const getAudioSubtype = (name: string): 'voiceover' | 'sfx' | 'music' => {
  const value = name.toLowerCase();
  if (value.includes('voiceover') || value.includes('narration') || value.includes('voice')) {
    return 'voiceover';
  }
  if (value.includes('sfx') || value.includes('sound') || value.includes('effect')) {
    return 'sfx';
  }
  return 'music';
};

const getLatestTimelineRecord = async (projectId: string): Promise<TimelineRecord | null> => {
  const { data, error } = await db
    .from('timelines')
    .select('id, project_id, user_id, composition_data, duration_ms, resolution, frame_rate, updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load editor timeline', error);
    return null;
  }

  return data as TimelineRecord | null;
};

const parseTimelineRecord = (record: TimelineRecord | null): EditorTimelineState => {
  if (!record) {
    return {
      clips: [],
      audioTracks: [],
      keyframes: [],
      composition: DEFAULT_EDITOR_COMPOSITION,
    };
  }

  const parsed = parseEditorTimelineDocument(record.composition_data);
  const [width, height] = (record.resolution ?? '').split('x').map(Number);

  return {
    ...parsed,
    composition: {
      ...parsed.composition,
      width: Number.isFinite(width) ? width : parsed.composition.width,
      height: Number.isFinite(height) ? height : parsed.composition.height,
      fps: record.frame_rate ?? parsed.composition.fps,
      duration: Math.max(record.duration_ms ?? 0, parsed.composition.duration),
    },
  };
};

const saveTimelineNow = async (
  projectId: string,
  clips: Clip[],
  audioTracks: AudioTrack[],
  composition: CompositionSettings,
  keyframes: Keyframe[] = []
) => {
  const userId = await getCurrentUserId();
  const document = createEditorTimelineDocument(clips, audioTracks, composition, keyframes);
  const payload = {
    composition_data: document,
    duration_ms: document.composition.duration,
    resolution: getResolutionString(document.composition),
    frame_rate: document.composition.fps,
    updated_at: new Date().toISOString(),
  };

  const record = await getLatestTimelineRecord(projectId);
  if (record) {
    const { error } = await db.from('timelines').update(payload).eq('id', record.id);
    if (error) throw error;
    return;
  }

  const { error } = await db.from('timelines').insert({
    project_id: projectId,
    user_id: userId,
    ...payload,
  });
  if (error) throw error;
};

const queueTimelineSave = (
  projectId: string,
  clips: Clip[],
  audioTracks: AudioTrack[],
  composition: CompositionSettings,
  keyframes: Keyframe[] = []
) => {
  const previous = timelineSaveQueues.get(projectId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => saveTimelineNow(projectId, clips, audioTracks, composition, keyframes))
    .catch((error) => {
      console.error('Failed to persist editor timeline', error);
      throw error;
    });

  timelineSaveQueues.set(projectId, next);
  void next.finally(() => {
    if (timelineSaveQueues.get(projectId) === next) {
      timelineSaveQueues.delete(projectId);
    }
  });

  return next;
};

const mergeClip = (clips: Clip[], clip: Clip) => {
  const exists = clips.some((item) => item.id === clip.id);
  return exists ? clips.map((item) => (item.id === clip.id ? clip : item)) : [...clips, clip];
};

const mergeAudioTrack = (tracks: AudioTrack[], track: AudioTrack) => {
  const exists = tracks.some((item) => item.id === track.id);
  return exists ? tracks.map((item) => (item.id === track.id ? track : item)) : [...tracks, track];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const stringOrUndefined = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const numberOrUndefined = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const recordOrUndefined = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const getCachedDurationSeconds = (...sources: Array<Record<string, unknown> | undefined>) => {
  for (const source of sources) {
    if (!source) continue;
    const durationSeconds = numberOrUndefined(source.duration_seconds ?? source.durationSeconds);
    if (durationSeconds && durationSeconds > 0) return durationSeconds;

    const durationMs = numberOrUndefined(source.duration_ms ?? source.durationMs);
    if (durationMs && durationMs > 0) return durationMs / 1000;
  }

  return undefined;
};

const getSourceType = (value: unknown): LibraryMediaItem['sourceType'] => {
  if (value === 'uploaded' || value === 'stock') return value;
  return 'ai-generated';
};

const getStatus = (value: unknown): LibraryMediaItem['status'] | undefined =>
  value === 'processing' || value === 'completed' || value === 'failed' ? value : undefined;

const mapFinalAssetRecord = (record: unknown, projectId: string): LibraryMediaItem | null => {
  if (!isRecord(record) || typeof record.file_url !== 'string') return null;
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const mediaMetadata = recordOrUndefined(metadata.media_metadata);
  const mediaType: LibraryMediaItem['mediaType'] =
    record.asset_type === 'video' ? 'video' : record.asset_type === 'audio' ? 'audio' : 'image';

  return {
    id: typeof record.id === 'string' ? record.id : record.file_url,
    projectId: typeof record.project_id === 'string' ? record.project_id : projectId,
    mediaType,
    name:
      typeof metadata.name === 'string'
        ? metadata.name
        : typeof record.name === 'string'
          ? record.name
        : typeof metadata.clip_name === 'string'
          ? metadata.clip_name
          : `Final ${mediaType}`,
    url: record.file_url,
    durationSeconds: getCachedDurationSeconds(record, metadata, mediaMetadata),
    sourceType: 'ai-generated',
    status: 'completed',
    thumbnailUrl:
      typeof metadata.thumbnail_url === 'string'
        ? metadata.thumbnail_url
        : mediaType === 'image'
          ? record.file_url
          : undefined,
    previewUrl: stringOrUndefined(metadata.preview_url),
    mediaMetadata,
  };
};

export const videoEditorService = {
  /**
   * Load all project media from multiple Supabase sources:
   * - media_items: uploaded/editor media
   * - project_assets: saved generation outputs from Studio
   * - generation_outputs: raw generation results
   * - final_project_assets: curated timeline export assets
   */
  async getMediaLibrary(projectId: string): Promise<LibraryMediaItem[]> {
    if (isDevAuthBypassEnabled()) {
      return [];
    }

    const [mediaItemsResult, projectAssetsResult, generationOutputsResult, finalAssetsResult] =
      await Promise.all([
        db
          .from('media_items')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        db
          .from('project_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        db
          .from('generation_outputs')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        db
          .from('final_project_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

    const items: LibraryMediaItem[] = [];
    const seenUrls = new Set<string>();

    const addItem = (item: LibraryMediaItem | null) => {
      if (!item) return;
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        items.push(item);
      } else if (!item.url) {
        items.push(item);
      }
    };

    if (!mediaItemsResult.error) {
      for (const record of ((mediaItemsResult.data ?? []) as any[])) {
        if (!record) continue;
        const metadata = recordOrUndefined(record.metadata);
        const mediaMetadata = recordOrUndefined(record.media_metadata) ?? recordOrUndefined(metadata?.media_metadata);
        const url = stringOrUndefined(record.url) ?? stringOrUndefined(record.file_url);
        addItem({
          id: record.id,
          projectId: record.project_id,
          mediaType: record.media_type ?? 'video',
          name: record.name ?? record.file_name ?? 'Untitled',
          url: url ?? null,
          durationSeconds: getCachedDurationSeconds(record, metadata, mediaMetadata),
          sourceType: record.source_type ?? 'uploaded',
          status: record.status ?? 'completed',
          thumbnailUrl:
            stringOrUndefined(record.thumbnail_url) ??
            stringOrUndefined(metadata?.thumbnail_url) ??
            (record.media_type === 'image' ? url : undefined),
          previewUrl: stringOrUndefined(record.preview_url) ?? stringOrUndefined(metadata?.preview_url),
          mediaMetadata,
        });
      }
    } else {
      console.error('Failed to load media_items', mediaItemsResult.error);
    }

    if (!projectAssetsResult.error) {
      for (const record of ((projectAssetsResult.data ?? []) as any[])) {
        if (!record) continue;
        const metadata = recordOrUndefined(record.metadata);
        const mediaMetadata = recordOrUndefined(record.media_metadata) ?? recordOrUndefined(metadata?.media_metadata);
        const url =
          stringOrUndefined(record.url) ??
          stringOrUndefined(record.cdn_url) ??
          stringOrUndefined(record.file_url);
        if (!url) continue;
        const assetType = stringOrUndefined(record.type) ?? stringOrUndefined(record.asset_type) ?? 'image';
        const mediaType: LibraryMediaItem['mediaType'] =
          assetType === 'video' ? 'video' : assetType === 'audio' ? 'audio' : 'image';
        const thumbnailUrl =
          stringOrUndefined(record.thumbnail_url) ??
          stringOrUndefined(metadata?.thumbnail_url) ??
          (mediaType === 'image' ? url : undefined);
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name:
            stringOrUndefined(record.name) ??
            stringOrUndefined(record.original_file_name) ??
            stringOrUndefined(record.file_name) ??
            'Project Asset',
          url,
          durationSeconds: getCachedDurationSeconds(record, metadata, mediaMetadata),
          sourceType: getSourceType(record.source_type ?? record.asset_category ?? metadata?.asset_category),
          status: getStatus(record.status ?? record.processing_status) ?? 'completed',
          thumbnailUrl,
          previewUrl: stringOrUndefined(record.preview_url) ?? stringOrUndefined(metadata?.preview_url),
          mediaMetadata,
        });
      }
    } else {
      console.error('Failed to load project_assets', projectAssetsResult.error);
    }

    if (!generationOutputsResult.error) {
      for (const record of ((generationOutputsResult.data ?? []) as any[])) {
        if (!record?.output_url) continue;
        const outputType = record.output_type as string;
        const mediaType: LibraryMediaItem['mediaType'] =
          outputType === 'video' ? 'video' : outputType === 'audio' ? 'audio' : 'image';
        const metadata = recordOrUndefined(record.metadata);
        const mediaMetadata = recordOrUndefined(record.media_metadata) ?? recordOrUndefined(metadata?.media_metadata);
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name: record.prompt?.slice(0, 40)
            ? `${record.prompt.slice(0, 37)}...`
            : `Generated ${mediaType}`,
          url: record.output_url,
          durationSeconds: getCachedDurationSeconds(record, metadata, mediaMetadata),
          sourceType: 'ai-generated',
          status: 'completed',
          thumbnailUrl:
            stringOrUndefined(record.thumbnail_url) ??
            stringOrUndefined(metadata?.thumbnail_url) ??
            (mediaType === 'image' ? record.output_url : undefined),
          previewUrl: stringOrUndefined(record.preview_url) ?? stringOrUndefined(metadata?.preview_url),
          mediaMetadata,
        });
      }
    } else {
      console.error('Failed to load generation_outputs', generationOutputsResult.error);
    }

    if (!finalAssetsResult.error) {
      for (const record of ((finalAssetsResult.data ?? []) as any[])) {
        addItem(mapFinalAssetRecord(record, projectId));
      }
    } else {
      console.error('Failed to load final_project_assets', finalAssetsResult.error);
    }

    return items;
  },

  async getEditorTimeline(projectId: string): Promise<EditorTimelineState> {
    return parseTimelineRecord(await getLatestTimelineRecord(projectId));
  },

  async getTimelineClips(projectId: string): Promise<Clip[]> {
    return (await this.getEditorTimeline(projectId)).clips;
  },

  async saveTimelineClip(projectId: string, clip: Clip): Promise<void> {
    const current = await this.getEditorTimeline(projectId);
    await queueTimelineSave(
      projectId,
      mergeClip(current.clips, clip),
      current.audioTracks,
      current.composition,
      current.keyframes
    );
  },

  async deleteTimelineClip(clipId: string, projectId?: string): Promise<void> {
    if (!projectId) return;
    const current = await this.getEditorTimeline(projectId);
    await queueTimelineSave(
      projectId,
      current.clips.filter((clip) => clip.id !== clipId),
      current.audioTracks,
      current.composition,
      current.keyframes.filter((keyframe) => keyframe.targetId !== clipId)
    );
  },

  async getAudioTracks(projectId: string): Promise<AudioTrack[]> {
    return (await this.getEditorTimeline(projectId)).audioTracks;
  },

  async saveAudioTrack(projectId: string, track: AudioTrack): Promise<void> {
    const current = await this.getEditorTimeline(projectId);
    await queueTimelineSave(
      projectId,
      current.clips,
      mergeAudioTrack(current.audioTracks, track),
      current.composition,
      current.keyframes
    );
  },

  async deleteAudioTrack(trackId: string, projectId?: string): Promise<void> {
    if (!projectId) return;
    const current = await this.getEditorTimeline(projectId);
    await queueTimelineSave(
      projectId,
      current.clips,
      current.audioTracks.filter((track) => track.id !== trackId),
      current.composition,
      current.keyframes.filter((keyframe) => keyframe.targetId !== trackId)
    );
  },

  async getComposition(projectId: string): Promise<CompositionSettings> {
    return (await this.getEditorTimeline(projectId)).composition;
  },

  async updateComposition(projectId: string, composition: Partial<CompositionSettings>): Promise<void> {
    const current = await this.getEditorTimeline(projectId);
    await queueTimelineSave(
      projectId,
      current.clips,
      current.audioTracks,
      {
        ...current.composition,
        ...composition,
      },
      current.keyframes
    );
  },

  async getTimelineClip(projectId: string, clipId: string): Promise<Clip | null> {
    const current = await this.getEditorTimeline(projectId);
    return current.clips.find((clip) => clip.id === clipId) ?? null;
  },

  async saveAllClipsAndTracks(
    projectId: string,
    clips: Clip[],
    audioTracks: AudioTrack[],
    composition: CompositionSettings = DEFAULT_EDITOR_COMPOSITION,
    keyframes: Keyframe[] = []
  ): Promise<void> {
    await queueTimelineSave(projectId, clips, audioTracks, composition, keyframes);
  },

  mapMediaItemRecord(record: unknown): LibraryMediaItem | null {
    if (!isRecord(record)) return null;
    const metadata = recordOrUndefined(record.metadata);
    const mediaMetadata = recordOrUndefined(record.media_metadata) ?? recordOrUndefined(metadata?.media_metadata);
    const url =
      stringOrUndefined(record.url) ??
      stringOrUndefined(record.file_url) ??
      stringOrUndefined(record.cdn_url) ??
      null;
    const mediaType: LibraryMediaItem['mediaType'] =
      record.media_type === 'image' ||
      record.asset_type === 'image' ||
      record.type === 'image'
        ? 'image'
        : record.media_type === 'audio' ||
            record.asset_type === 'audio' ||
            record.type === 'audio'
          ? 'audio'
          : 'video';
    return {
      id: typeof record.id === 'string' ? record.id : '',
      projectId: typeof record.project_id === 'string' ? record.project_id : '',
      mediaType,
      name:
        typeof record.name === 'string'
          ? record.name
          : typeof record.original_file_name === 'string'
            ? record.original_file_name
          : typeof record.file_name === 'string'
            ? record.file_name
            : 'Untitled',
      url,
      durationSeconds: getCachedDurationSeconds(record, metadata, mediaMetadata),
      sourceType: getSourceType(record.source_type ?? record.asset_category ?? metadata?.asset_category),
      status: getStatus(record.status ?? record.processing_status),
      thumbnailUrl:
        stringOrUndefined(record.thumbnail_url) ??
        stringOrUndefined(metadata?.thumbnail_url) ??
        (mediaType === 'image' ? url : undefined),
      previewUrl: stringOrUndefined(record.preview_url) ?? stringOrUndefined(metadata?.preview_url),
      mediaMetadata,
    };
  },

  async getAudioTrack(projectId: string, trackId: string): Promise<AudioTrack | null> {
    const current = await this.getEditorTimeline(projectId);
    return current.audioTracks.find((track) => track.id === trackId) ?? null;
  },

  async getMediaItems(projectId: string): Promise<LibraryMediaItem[]> {
    return this.getMediaLibrary(projectId);
  },

  async syncTimelineAssetsForDirectorCut(projectId: string) {
    const userId = await getCurrentUserId();
    const { clips, audioTracks, composition, keyframes } = await this.getEditorTimeline(projectId);
    const sortedClips = [...clips]
      .filter((clip) => !!clip.url && (clip.type === 'image' || clip.type === 'video'))
      .sort((a, b) => (a.startTime - b.startTime) || (a.layer - b.layer));
    const sortedAudio = [...audioTracks]
      .filter((track) => !!track.url)
      .sort((a, b) => (a.startTime - b.startTime) || ((a.trackIndex ?? 0) - (b.trackIndex ?? 0)));

    const rows = [
      ...sortedClips.map((clip, index) => ({
        project_id: projectId,
        user_id: userId,
        position_order: index,
        asset_type: clip.type,
        source_url: clip.url,
        duration_ms: clip.duration,
        metadata: {
          source: 'editor_timeline',
          asset_role: 'shot_visual',
          clip_id: clip.id,
          name: clip.name,
          thumbnail_url: clip.thumbnailUrl ?? null,
          preview_url: clip.previewUrl ?? null,
          media_metadata: clip.mediaMetadata ?? {},
          start_time_ms: clip.startTime,
          end_time_ms: clip.endTime ?? clip.startTime + clip.duration,
          layer: clip.layer,
          trim_start_ms: clip.trimStart,
          trim_end_ms: clip.trimEnd,
          transforms: clip.transforms,
          transition: clip.transition,
          effects: clip.effects ?? [],
          keyframes: keyframes.filter((keyframe) => keyframe.targetId === clip.id),
          composition,
        },
      })),
      ...sortedAudio.map((track, index) => ({
        project_id: projectId,
        user_id: userId,
        position_order: sortedClips.length + index,
        asset_type: 'audio',
        source_url: track.url,
        duration_ms: track.duration,
        metadata: {
          source: 'editor_timeline',
          asset_role: getAudioSubtype(track.name),
          track_id: track.id,
          name: track.name,
          thumbnail_url: track.thumbnailUrl ?? null,
          preview_url: track.previewUrl ?? null,
          media_metadata: track.mediaMetadata ?? {},
          start_time_ms: track.startTime,
          end_time_ms: track.endTime ?? track.startTime + track.duration,
          volume: track.volume,
          is_muted: track.isMuted,
          fade_in_duration_ms: track.fadeInDuration,
          fade_out_duration_ms: track.fadeOutDuration,
        },
      })),
    ];

    await db.from('timeline_assets').delete().eq('project_id', projectId);

    if (rows.length > 0) {
      const { error } = await db.from('timeline_assets').insert(rows);
      if (error) throw error;
    }

    return {
      totalShots: clips.length,
      syncedAssets: rows.length,
      readyVideos: sortedClips.filter((clip) => clip.type === 'video').length,
      fallbackImages: sortedClips.filter((clip) => clip.type === 'image').length,
      missingShots: Math.max(0, clips.length - sortedClips.length),
      durationMs: getTimelineDurationMs(clips, audioTracks, composition.duration),
    };
  },
};
