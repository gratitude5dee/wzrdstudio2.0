/**
 * Hook for managing final project assets - the curated collection of
 * images, videos, and audio tracks ready for final export.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { isDevAuthBypassEnabled } from '@/lib/devAuthBypass';

type QueryError = { message?: string };
type QueryResult<T = unknown> = { data: T | null; error: QueryError | null };
interface SupabaseQueryBuilder<T = unknown> extends PromiseLike<QueryResult<T>> {
  select: (columns?: string) => SupabaseQueryBuilder<T>;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilder<T>;
  insert: (values: unknown) => SupabaseQueryBuilder<T>;
  update: (values: unknown) => SupabaseQueryBuilder<T>;
  delete: () => SupabaseQueryBuilder<T>;
  single: () => Promise<QueryResult<T>>;
}
type UntypedSupabaseClient = {
  from: <T = unknown>(table: string) => SupabaseQueryBuilder<T>;
};

const db = supabase as unknown as UntypedSupabaseClient;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export interface FinalProjectAsset {
  id: string;
  project_id: string;
  asset_type: 'image' | 'video' | 'audio';
  asset_subtype?: 'voiceover' | 'sfx' | 'music' | 'visual';
  name: string;
  url: string;
  thumbnail_url?: string;
  duration_ms?: number;
  order_index: number;
  shot_card_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SaveTimelineToFinalOptions {
  includeVideo?: boolean;
  includeAudio?: boolean;
  audioTypes?: ('voiceover' | 'sfx' | 'music')[];
}

export function useFinalProjectAssets(projectId: string | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [assets, setAssets] = useState<FinalProjectAsset[]>([]);
  const [exportProgress, setExportProgress] = useState(0);

  const clips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const keyframes = useVideoEditorStore((state) => state.keyframes);

  const normalizeAsset = useCallback((record: unknown): FinalProjectAsset => {
    const row = isRecord(record) ? record : {};
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const assetType =
      row.asset_type === 'video' || row.asset_type === 'audio' || row.asset_type === 'image'
        ? row.asset_type
        : 'image';
    return {
      id: typeof row.id === 'string' ? row.id : '',
      project_id: typeof row.project_id === 'string' ? row.project_id : '',
      asset_type: assetType,
      asset_subtype:
        metadata.asset_subtype === 'voiceover' ||
        metadata.asset_subtype === 'sfx' ||
        metadata.asset_subtype === 'music' ||
        metadata.asset_subtype === 'visual'
          ? metadata.asset_subtype
          : undefined,
      name: typeof metadata.name === 'string' ? metadata.name : `Final ${assetType}`,
      url: typeof row.file_url === 'string' ? row.file_url : '',
      thumbnail_url: typeof metadata.thumbnail_url === 'string' ? metadata.thumbnail_url : undefined,
      duration_ms: typeof row.duration_ms === 'number' ? row.duration_ms : undefined,
      order_index: typeof metadata.order_index === 'number' ? metadata.order_index : 0,
      shot_card_id: typeof metadata.shot_card_id === 'string' ? metadata.shot_card_id : undefined,
      metadata,
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
    };
  }, []);

  /**
   * Load final project assets from Supabase
   */
  const loadAssets = useCallback(async () => {
    if (!projectId) return;
    if (isDevAuthBypassEnabled()) {
      setAssets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('final_project_assets')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      setAssets(rows.map(normalizeAsset).sort((a, b) => a.order_index - b.order_index));
    } catch (error) {
      console.error('Error loading final project assets:', error);
      toast.error('Failed to load final project assets');
    } finally {
      setIsLoading(false);
    }
  }, [normalizeAsset, projectId]);

  /**
   * Save a single asset to the final project assets collection
   */
  const saveAsset = useCallback(async (asset: Omit<FinalProjectAsset, 'id' | 'project_id' | 'created_at'>) => {
    if (!projectId) {
      toast.error('No project selected');
      return null;
    }

    setIsSaving(true);
    try {
      if (isDevAuthBypassEnabled()) {
        const localAsset: FinalProjectAsset = {
          id: `local-final-${Date.now()}`,
          project_id: projectId,
          created_at: new Date().toISOString(),
          ...asset,
        };
        setAssets((prev) => [...prev, localAsset]);
        toast.success(`${asset.name} added to local final assets`);
        return localAsset;
      }

      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('You must be signed in to save final assets.');

      const { data, error } = await db
        .from('final_project_assets')
        .insert({
          project_id: projectId,
          asset_type: asset.asset_type,
          file_url: asset.url,
          duration_ms: asset.duration_ms,
          metadata: {
            ...(asset.metadata ?? {}),
            asset_subtype: asset.asset_subtype,
            name: asset.name,
            thumbnail_url: asset.thumbnail_url,
            order_index: asset.order_index,
            shot_card_id: asset.shot_card_id,
          },
          user_id: userId,
        })
        .select()
        .single();

      if (error) throw error;

      setAssets(prev => [...prev, normalizeAsset(data)]);
      toast.success(`${asset.name} added to final assets`);
      return data as FinalProjectAsset;
    } catch (error) {
      console.error('Error saving final project asset:', error);
      toast.error('Failed to save asset to final collection');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [normalizeAsset, projectId]);

  /**
   * Save all timeline clips and audio tracks to final project assets
   */
  const saveTimelineToFinal = useCallback(async (options: SaveTimelineToFinalOptions = {}) => {
    if (!projectId) {
      toast.error('No project selected');
      return false;
    }

    const {
      includeVideo = true,
      includeAudio = true,
      audioTypes = ['voiceover', 'sfx', 'music'],
    } = options;

    setIsSaving(true);
    try {
      const assetsToSave: Omit<FinalProjectAsset, 'id' | 'project_id' | 'created_at'>[] = [];

      // Sort clips by start time to maintain order
      const sortedClips = [...clips].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
      const sortedAudio = [...audioTracks].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

      // Add video/image clips
      if (includeVideo) {
        sortedClips.forEach((clip, index) => {
          assetsToSave.push({
            asset_type: clip.type === 'video' ? 'video' : 'image',
            asset_subtype: 'visual',
            name: clip.name || `Shot ${index + 1}`,
            url: clip.url,
            thumbnail_url: clip.thumbnailUrl ?? (clip.type === 'image' ? clip.url : undefined),
            duration_ms: clip.duration,
            order_index: index,
            metadata: {
              startTime: clip.startTime,
              endTime: clip.endTime,
              thumbnail_url: clip.thumbnailUrl ?? (clip.type === 'image' ? clip.url : undefined),
              preview_url: clip.previewUrl,
              media_metadata: clip.mediaMetadata,
              transforms: clip.transforms,
              transition: clip.transition,
              effects: clip.effects ?? [],
              keyframes: keyframes.filter((keyframe) => keyframe.targetId === clip.id),
              layer: clip.layer,
            },
          });
        });
      }

      // Add audio tracks
      if (includeAudio) {
        let audioIndex = sortedClips.length;
        sortedAudio.forEach((track) => {
          // Determine audio subtype based on track name or metadata
          let subtype: 'voiceover' | 'sfx' | 'music' = 'music';
          const trackNameLower = track.name.toLowerCase();
          if (trackNameLower.includes('voiceover') || trackNameLower.includes('narration') || trackNameLower.includes('voice')) {
            subtype = 'voiceover';
          } else if (trackNameLower.includes('sfx') || trackNameLower.includes('sound') || trackNameLower.includes('effect')) {
            subtype = 'sfx';
          }

          if (audioTypes.includes(subtype)) {
            assetsToSave.push({
              asset_type: 'audio',
              asset_subtype: subtype,
              name: track.name || `Audio ${audioIndex + 1}`,
              url: track.url,
              thumbnail_url: track.thumbnailUrl ?? undefined,
              duration_ms: track.duration,
              order_index: audioIndex++,
              metadata: {
                startTime: track.startTime,
                endTime: track.endTime,
                thumbnail_url: track.thumbnailUrl,
                preview_url: track.previewUrl,
                media_metadata: track.mediaMetadata,
                volume: track.volume,
                isMuted: track.isMuted,
                fadeInDuration: track.fadeInDuration,
                fadeOutDuration: track.fadeOutDuration,
              },
            });
          }
        });
      }

      if (assetsToSave.length === 0) {
        toast.info('No assets to save to final collection');
        return false;
      }

      if (isDevAuthBypassEnabled()) {
        const now = new Date().toISOString();
        setAssets(
          assetsToSave.map((asset, index) => ({
            id: `local-final-${index}-${Date.now()}`,
            project_id: projectId,
            created_at: now,
            ...asset,
          }))
        );
        toast.success(`${assetsToSave.length} assets saved locally`);
        return true;
      }

      // Clear existing assets first (optional - could be a merge instead)
      await db
        .from('final_project_assets')
        .delete()
        .eq('project_id', projectId);

      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('You must be signed in to save final assets.');

      // Insert all new assets
      const { data, error } = await db
        .from('final_project_assets')
        .insert(assetsToSave.map(asset => ({
          project_id: projectId,
          asset_type: asset.asset_type,
          file_url: asset.url,
          duration_ms: asset.duration_ms,
          metadata: {
            ...(asset.metadata ?? {}),
            asset_subtype: asset.asset_subtype,
            name: asset.name,
            thumbnail_url: asset.thumbnail_url,
            order_index: asset.order_index,
            shot_card_id: asset.shot_card_id,
          },
          user_id: userId,
        })))
        .select();

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      setAssets(rows.map(normalizeAsset));
      toast.success(`${assetsToSave.length} assets saved to final collection`);
      return true;
    } catch (error) {
      console.error('Error saving timeline to final assets:', error);
      toast.error('Failed to save timeline to final assets');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [normalizeAsset, projectId, clips, audioTracks, keyframes]);

  /**
   * Reorder assets in the final collection
   */
  const reorderAssets = useCallback(async (newOrder: string[]) => {
    if (!projectId) return false;

    try {
      const assetMap = new Map(assets.map(a => [a.id, a]));
      if (isDevAuthBypassEnabled()) {
        setAssets(
          newOrder
            .map((id, index) => {
              const asset = assetMap.get(id);
              return asset ? { ...asset, order_index: index } : null;
            })
            .filter((asset): asset is FinalProjectAsset => asset !== null)
        );
        return true;
      }

      await Promise.all(newOrder.map((id, index) => {
        const asset = assetMap.get(id);
        if (!asset) return Promise.resolve();
        return db
          .from('final_project_assets')
          .update({ metadata: { ...(asset.metadata ?? {}), order_index: index } })
          .eq('id', id);
      }));

      // Update local state
      setAssets(prev => {
        const assetMap = new Map(prev.map(a => [a.id, a]));
        return newOrder.map((id, index) => ({
          ...assetMap.get(id)!,
          order_index: index,
        }));
      });

      return true;
    } catch (error) {
      console.error('Error reordering assets:', error);
      toast.error('Failed to reorder assets');
      return false;
    }
  }, [assets, projectId]);

  /**
   * Remove an asset from the final collection
   */
  const removeAsset = useCallback(async (assetId: string) => {
    try {
      if (isDevAuthBypassEnabled()) {
        setAssets(prev => prev.filter(a => a.id !== assetId));
        toast.success('Asset removed from local final collection');
        return true;
      }

      const { error } = await db
        .from('final_project_assets')
        .delete()
        .eq('id', assetId);

      if (error) throw error;

      setAssets(prev => prev.filter(a => a.id !== assetId));
      toast.success('Asset removed from final collection');
      return true;
    } catch (error) {
      console.error('Error removing asset:', error);
      toast.error('Failed to remove asset');
      return false;
    }
  }, []);

  /**
   * Trigger the FFMPEG stitching process to create the final video
   */
  const createFinalAsset = useCallback(async () => {
    if (!projectId) {
      toast.error('No project selected');
      return null;
    }

    if (assets.length === 0) {
      toast.error('No assets in the final collection. Save timeline first.');
      return null;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      if (isDevAuthBypassEnabled()) {
        toast.info('Final asset export requires a saved Supabase project.');
        return null;
      }

      toast.info('Starting final asset creation...');

      // Call the Supabase Edge Function to stitch assets
      const { data, error } = await supabase.functions.invoke('create-final-asset', {
        body: {
          projectId,
          assets: assets.map(a => ({
            id: a.id,
            type: a.asset_type,
            subtype: a.asset_subtype,
            url: a.url,
            duration_ms: a.duration_ms,
            order_index: a.order_index,
            metadata: a.metadata,
          })),
        },
      });

      if (error) throw error;

      if (data?.status === 'processing') {
        // Poll for completion
        const checkStatus = async () => {
          const { data: statusData, error: statusError } = await supabase.functions.invoke('create-final-asset', {
            body: {
              action: 'status',
              jobId: data.jobId,
            },
          });

          if (statusError) throw statusError;

          if (statusData?.progress) {
            setExportProgress(statusData.progress);
          }

          if (statusData?.status === 'completed') {
            toast.success('Final video created successfully!');
            return statusData.outputUrl;
          } else if (statusData?.status === 'failed') {
            throw new Error(statusData.error || 'Export failed');
          }

          // Continue polling
          await new Promise(resolve => setTimeout(resolve, 2000));
          return checkStatus();
        };

        return await checkStatus();
      }

      toast.success('Final video created successfully!');
      return data?.outputUrl;
    } catch (error) {
      console.error('Error creating final asset:', error);
      toast.error(`Failed to create final asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [projectId, assets]);

  return {
    assets,
    isLoading,
    isSaving,
    isExporting,
    exportProgress,
    loadAssets,
    saveAsset,
    saveTimelineToFinal,
    reorderAssets,
    removeAsset,
    createFinalAsset,
  };
}

export default useFinalProjectAssets;
