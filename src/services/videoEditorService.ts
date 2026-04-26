import { supabase } from '@/integrations/supabase/client';
import type { AudioTrack, Clip, CompositionSettings, LibraryMediaItem } from '@/store/videoEditorStore';

const ensureCompositionDefaults = (partial: Partial<CompositionSettings> = {}): CompositionSettings => ({
  width: partial.width ?? 1920,
  height: partial.height ?? 1080,
  fps: partial.fps ?? 30,
  aspectRatio: partial.aspectRatio ?? '16:9',
  duration: partial.duration ?? 30000,
  backgroundColor: partial.backgroundColor ?? '#000000',
});

// NOTE: Database tables 'timeline_clips' and 'compositions' don't exist yet in the schema
// This is a stub implementation until the schema is updated

export const videoEditorService = {
  /**
   * Load all project media from multiple Supabase sources:
   * - media_items: uploaded/editor media
   * - project_assets: saved generation outputs from Studio
   * - generation_outputs: raw generation results
   * - final_project_assets: project-setup timeline assets (shot images/videos)
   */
  async getMediaLibrary(projectId: string): Promise<LibraryMediaItem[]> {
    // Fetch from all asset sources in parallel
    const [mediaItemsResult, projectAssetsResult, generationOutputsResult, finalAssetsResult] =
      await Promise.all([
        (supabase as any)
          .from('media_items')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('project_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('generation_outputs')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('final_project_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

    const items: LibraryMediaItem[] = [];
    const seenUrls = new Set<string>();

    // Helper to deduplicate by URL
    const addItem = (item: LibraryMediaItem) => {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        items.push(item);
      } else if (!item.url) {
        // Still include items without URLs (processing state)
        items.push(item);
      }
    };

    // 1. media_items (uploaded & editor media)
    if (!mediaItemsResult.error) {
      for (const record of mediaItemsResult.data ?? []) {
        if (!record) continue;
        addItem({
          id: record.id,
          projectId: record.project_id,
          mediaType: record.media_type ?? 'video',
          name: record.name ?? record.file_name ?? 'Untitled',
          url: record.url ?? record.file_url ?? null,
          durationSeconds: typeof record.duration_seconds === 'number' ? record.duration_seconds : undefined,
          sourceType: record.source_type ?? 'uploaded',
          status: record.status ?? 'completed',
          thumbnailUrl: record.thumbnail_url ?? undefined,
        });
      }
    } else {
      console.error('Failed to load media_items', mediaItemsResult.error);
    }

    // 2. project_assets (Studio-saved assets)
    if (!projectAssetsResult.error) {
      for (const record of projectAssetsResult.data ?? []) {
        if (!record || !record.url) continue;
        const assetType = record.type as string;
        const mediaType: 'video' | 'image' | 'audio' =
          assetType === 'video' ? 'video' :
          assetType === 'audio' ? 'audio' : 'image';
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name: record.name ?? 'Project Asset',
          url: record.url,
          sourceType: 'ai-generated',
          status: 'completed',
          thumbnailUrl: record.thumbnail_url ?? (mediaType === 'image' ? record.url : undefined),
        });
      }
    } else {
      console.error('Failed to load project_assets', projectAssetsResult.error);
    }

    // 3. generation_outputs (raw AI generation results)
    if (!generationOutputsResult.error) {
      for (const record of generationOutputsResult.data ?? []) {
        if (!record || !record.output_url) continue;
        const outputType = record.output_type as string;
        const mediaType: 'video' | 'image' | 'audio' =
          outputType === 'video' ? 'video' :
          outputType === 'audio' ? 'audio' : 'image';
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name: record.prompt?.slice(0, 40)
            ? `${record.prompt.slice(0, 37)}...`
            : `Generated ${mediaType}`,
          url: record.output_url,
          sourceType: 'ai-generated',
          status: 'completed',
          thumbnailUrl: record.thumbnail_url ?? (mediaType === 'image' ? record.output_url : undefined),
        });
      }
    } else {
      console.error('Failed to load generation_outputs', generationOutputsResult.error);
    }

    // 4. final_project_assets (project-setup shot images/videos)
    if (!finalAssetsResult.error) {
      for (const record of finalAssetsResult.data ?? []) {
        if (!record || !record.file_url) continue;
        const assetType = record.asset_type as string;
        const mediaType: 'video' | 'image' | 'audio' =
          assetType === 'video' ? 'video' :
          assetType === 'audio' ? 'audio' : 'image';
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name: record.name ?? `Shot ${mediaType}`,
          url: record.file_url,
          durationSeconds: typeof record.duration_ms === 'number' ? record.duration_ms / 1000 : undefined,
          sourceType: 'ai-generated',
          status: 'completed',
          thumbnailUrl: mediaType === 'image' ? record.file_url : undefined,
        });
      }
    } else {
      console.error('Failed to load final_project_assets', finalAssetsResult.error);
    }

    return items;
  },

  async getTimelineClips(projectId: string): Promise<Clip[]> {
    const { data, error } = await (supabase as any)
      .from('timeline_clips')
      .select('*')
      .eq('project_id', projectId)
      .order('start_time_ms', { ascending: true });

    if (error) {
      console.error('Failed to load timeline clips', error);
      return [];
    }

    return (data ?? []).map((record: any): Clip => ({
      id: record.id,
      mediaItemId: record.media_item_id,
      type: record.media_type === 'image' ? 'image' : 'video',
      name: record.name ?? 'Clip',
      url: record.file_url ?? '',
      startTime: record.start_time_ms ?? 0,
      duration: record.duration_ms ?? 0,
      layer: record.track_index ?? 0,
      trimStart: record.trim_start_ms,
      trimEnd: record.trim_end_ms,
      transforms: {
        position: { x: record.position_x ?? 0, y: record.position_y ?? 0 },
        scale: { x: record.scale_x ?? 1, y: record.scale_y ?? 1 },
        rotation: record.rotation ?? 0,
        opacity: record.opacity ?? 1,
      },
    }));
  },

  async saveTimelineClip(projectId: string, clip: Clip): Promise<void> {
    const { error } = await (supabase as any).from('timeline_clips').upsert({
      id: clip.id,
      project_id: projectId,
      media_item_id: clip.mediaItemId,
      media_type: clip.type,
      name: clip.name,
      file_url: clip.url,
      start_time_ms: clip.startTime,
      duration_ms: clip.duration,
      track_index: clip.layer,
      trim_start_ms: clip.trimStart,
      trim_end_ms: clip.trimEnd,
      position_x: clip.transforms.position.x,
      position_y: clip.transforms.position.y,
      scale_x: clip.transforms.scale.x,
      scale_y: clip.transforms.scale.y,
      rotation: clip.transforms.rotation,
      opacity: clip.transforms.opacity,
    });

    if (error) {
      console.error('Failed to save timeline clip', error);
      throw error;
    }
  },

  async deleteTimelineClip(clipId: string): Promise<void> {
    const { error } = await (supabase as any).from('timeline_clips').delete().eq('id', clipId);
    if (error) {
      console.error('Failed to delete timeline clip', error);
      throw error;
    }
  },

  // Stub implementations for audio_tracks operations
  async getAudioTracks(projectId: string): Promise<AudioTrack[]> {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .eq('project_id', projectId);

    if (error) {
      console.error('Failed to load audio tracks', error);
      return [];
    }

    return (data ?? []).map((record: any): AudioTrack => ({
      id: record.id,
      type: 'audio',
      name: record.name ?? 'Audio Track',
      url: record.storage_path ?? '',
      startTime: record.start_time_ms ?? 0,
      duration: record.duration_ms ?? 0,
      endTime: record.end_time_ms ?? 0,
      trackIndex: 0,
      volume: record.volume ?? 1,
      isMuted: record.is_muted ?? false,
      fadeInDuration: 0,
      fadeOutDuration: 0,
    }));
  },

  async saveAudioTrack(projectId: string, track: AudioTrack): Promise<void> {
    const { error } = await supabase.from('audio_tracks').upsert({
      id: track.id,
      project_id: projectId,
      name: track.name,
      storage_path: track.url,
      start_time_ms: track.startTime,
      duration_ms: track.duration,
      end_time_ms: track.endTime,
      volume: track.volume,
      is_muted: track.isMuted,
      storage_bucket: 'project-media',
      user_id: (await supabase.auth.getUser()).data.user?.id,
    });

    if (error) {
      console.error('Failed to save audio track', error);
      throw error;
    }
  },

  async deleteAudioTrack(trackId: string): Promise<void> {
    const { error } = await supabase.from('audio_tracks').delete().eq('id', trackId);
    if (error) {
      console.error('Failed to delete audio track', error);
    }
  },

  async getComposition(projectId: string): Promise<CompositionSettings> {
    const { data, error } = await (supabase as any)
      .from('compositions')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error || !data) {
      return ensureCompositionDefaults();
    }

    const record = data as any;
    return ensureCompositionDefaults({
      width: record.width,
      height: record.height,
      fps: record.fps,
      aspectRatio: record.aspect_ratio as any,
      duration: record.duration_ms,
      backgroundColor: record.background_color,
    });
  },

  async updateComposition(projectId: string, composition: Partial<CompositionSettings>): Promise<void> {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await (supabase as any).from('compositions').upsert({
      project_id: projectId,
      user_id: userId,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      aspect_ratio: composition.aspectRatio,
      duration_ms: composition.duration,
      background_color: composition.backgroundColor,
    });

    if (error) {
      console.error('Failed to update composition', error);
      throw error;
    }
  },

  async getTimelineClip(projectId: string, clipId: string): Promise<Clip | null> {
    const { data, error } = await (supabase as any)
      .from('timeline_clips')
      .select('*')
      .eq('id', clipId)
      .eq('project_id', projectId)
      .single();

    if (error || !data) {
      return null;
    }

    const record = data as any;
    return {
      id: record.id,
      mediaItemId: record.media_item_id,
      type: record.media_type === 'image' ? 'image' : 'video',
      name: record.name ?? 'Clip',
      url: record.file_url ?? '',
      startTime: record.start_time_ms ?? 0,
      duration: record.duration_ms ?? 0,
      layer: record.track_index ?? 0,
      trimStart: record.trim_start_ms,
      trimEnd: record.trim_end_ms,
      transforms: {
        position: { x: record.position_x ?? 0, y: record.position_y ?? 0 },
        scale: { x: record.scale_x ?? 1, y: record.scale_y ?? 1 },
        rotation: record.rotation ?? 0,
        opacity: record.opacity ?? 1,
      },
    };
  },

  async saveAllClipsAndTracks(
    projectId: string,
    clips: Clip[],
    audioTracks: AudioTrack[]
  ): Promise<void> {
    await Promise.all([
      ...clips.map(clip => this.saveTimelineClip(projectId, clip)),
      ...audioTracks.map(track => this.saveAudioTrack(projectId, track)),
    ]);
  },

  // Additional stub methods
  mapMediaItemRecord(record: any): LibraryMediaItem | null {
    if (!record) return null;
    return {
      id: record.id,
      projectId: record.project_id,
      mediaType: record.media_type ?? 'video',
      name: record.name ?? record.file_name ?? 'Untitled',
      url: record.url ?? record.file_url ?? null,
      durationSeconds: typeof record.duration_seconds === 'number' ? record.duration_seconds : undefined,
      sourceType: record.source_type ?? undefined,
      status: record.status ?? undefined,
      thumbnailUrl: record.thumbnail_url ?? undefined,
    };
  },

  async getAudioTrack(projectId: string, trackId: string): Promise<AudioTrack | null> {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .eq('id', trackId)
      .eq('project_id', projectId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      type: 'audio',
      name: data.name ?? 'Audio Track',
      url: data.storage_path ?? '',
      startTime: data.start_time_ms ?? 0,
      duration: data.duration_ms ?? 0,
      endTime: data.end_time_ms ?? 0,
      trackIndex: 0,
      volume: data.volume ?? 1,
      isMuted: data.is_muted ?? false,
      fadeInDuration: 0,
      fadeOutDuration: 0,
    };
  },

  async getMediaItems(projectId: string): Promise<LibraryMediaItem[]> {
    return this.getMediaLibrary(projectId);
  },
};
