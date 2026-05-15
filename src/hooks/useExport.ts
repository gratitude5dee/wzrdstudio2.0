import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isRemoteFetchableMediaUrl } from '@/lib/editor/renderCapabilities';
import { useVideoEditorStore, Clip, AudioTrack, CompositionSettings } from '@/store/videoEditorStore';

interface ExportOptions {
  format: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high' | '4k';
  renderBackend?: 'fal_remote' | 'remotion_worker';
}

const SUPPORTED_FORMATS: ExportOptions['format'][] = ['mp4'];
const SUPPORTED_QUALITIES: ExportOptions['quality'][] = ['low', 'medium', 'high', '4k'];
const EXPORT_POLL_INTERVAL_MS = 2000;
const EXPORT_MAX_POLLS = 180;

interface ExportContext {
  projectId: string | null;
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
}

interface ExportDependencies {
  invoke: typeof supabase.functions.invoke;
  wait?: (ms: number) => Promise<void>;
  onProgress?: (progress: number) => void;
}

export interface ExportResult {
  url?: string;
  error?: string;
  renderWarnings?: ExportRenderWarning[];
}

export interface ExportRenderWarning {
  assetId: string;
  orderIndex: number;
  features: string[];
  reason: string;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isExportRenderWarning = (value: unknown): value is ExportRenderWarning => {
  if (!isRecord(value)) return false;
  return (
    typeof value.assetId === 'string' &&
    typeof value.orderIndex === 'number' &&
    Number.isFinite(value.orderIndex) &&
    Array.isArray(value.features) &&
    value.features.every((feature) => typeof feature === 'string') &&
    typeof value.reason === 'string'
  );
};

export const getRenderWarningsFromProviderPayload = (payload: unknown): ExportRenderWarning[] => {
  if (!isRecord(payload) || !Array.isArray(payload.renderWarnings)) {
    return [];
  }
  return payload.renderWarnings.filter(isExportRenderWarning);
};

const validateRequest = (context: ExportContext, options: ExportOptions): string | null => {
  if (!context.projectId) {
    return 'Save the project before exporting.';
  }
  if (!SUPPORTED_FORMATS.includes(options.format)) {
    return 'Director\'s Cut export currently renders MP4.';
  }
  if (!SUPPORTED_QUALITIES.includes(options.quality)) {
    return 'Unsupported quality preset.';
  }
  if (context.clips.length === 0 && context.audioTracks.length === 0) {
    return 'Add at least one clip or audio track before exporting.';
  }
  if (context.clips.length === 0) {
    return 'Add at least one visual clip before exporting.';
  }
  if (!context.clips.some((clip) => isRemoteFetchableMediaUrl(clip.url))) {
    return 'Add at least one visual clip with a public HTTP(S) URL before exporting.';
  }
  return null;
};

const qualityToSettings = (
  quality: ExportOptions['quality'],
  composition: CompositionSettings,
  renderBackend: ExportOptions['renderBackend'] = 'fal_remote'
) => {
  const presets: Record<ExportOptions['quality'], { resolution: string; fps: number }> = {
    low: { resolution: '854x480', fps: Math.min(composition.fps, 24) },
    medium: { resolution: '1280x720', fps: composition.fps },
    high: { resolution: `${composition.width}x${composition.height}`, fps: composition.fps },
    '4k': { resolution: '3840x2160', fps: composition.fps },
  };

  return {
    ...presets[quality],
    quality,
    includeAudio: true,
    codec: 'h264',
    renderBackend,
  };
};

export const runExportRequest = async (
  deps: ExportDependencies,
  context: ExportContext,
  options: ExportOptions
): Promise<ExportResult> => {
  const validationError = validateRequest(context, options);
  if (validationError) {
    return { error: validationError };
  }

  try {
    deps.onProgress?.(5);
    const settings = qualityToSettings(options.quality, context.composition, options.renderBackend);
    const { data, error } = await deps.invoke('director-cut', {
      body: {
        action: 'create',
        projectId: context.projectId,
        settings,
      },
    });

    if (error) {
      throw new Error(error.message ?? 'Export failed.');
    }

    const jobId = data?.jobId as string | undefined;
    if (!jobId) {
      throw new Error('Director\'s Cut did not return a render job.');
    }

    deps.onProgress?.(data?.progress ?? 10);
    const waitFor = deps.wait ?? wait;

    for (let poll = 0; poll < EXPORT_MAX_POLLS; poll += 1) {
      await waitFor(EXPORT_POLL_INTERVAL_MS);

      const { data: statusData, error: statusError } = await deps.invoke('director-cut', {
        body: {
          action: 'status',
          projectId: context.projectId,
          jobId,
        },
      });

      if (statusError) {
        throw new Error(statusError.message ?? 'Failed to check export status.');
      }

      deps.onProgress?.(statusData?.progress ?? 10);

      if (statusData?.status === 'completed') {
        if (!statusData.outputUrl) {
          throw new Error('Export completed without a downloadable URL.');
        }
        return {
          url: statusData.outputUrl,
          renderWarnings: getRenderWarningsFromProviderPayload(statusData.providerPayload),
        };
      }

      if (statusData?.status === 'failed') {
        throw new Error(statusData.error || 'Director\'s Cut export failed.');
      }
    }

    return { error: 'Export is still processing. Check Director\'s Cut for the latest status.' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to export video. Please try again.',
    };
  }
};

export const runExportFromEditorStore = async (
  deps: ExportDependencies,
  options: ExportOptions
): Promise<ExportResult> => {
  const { project, clips, audioTracks, composition } = useVideoEditorStore.getState();
  return runExportRequest(
    deps,
    { projectId: project.id, clips, audioTracks, composition },
    options
  );
};

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [renderWarnings, setRenderWarnings] = useState<ExportRenderWarning[]>([]);

  const resetExportState = useCallback(() => {
    setIsExporting(false);
    setProgress(0);
    setError(null);
    setDownloadUrl(null);
    setRenderWarnings([]);
  }, []);

  const exportVideo = useCallback(async ({ format, quality, renderBackend }: ExportOptions) => {
    setIsExporting(true);
    setProgress(5);
    setError(null);
    setDownloadUrl(null);
    setRenderWarnings([]);

    const result = await runExportFromEditorStore(
      {
        invoke: supabase.functions.invoke.bind(supabase.functions),
        onProgress: setProgress,
      },
      { format, quality, renderBackend }
    );

    if (result.error) {
      setError(result.error);
      setIsExporting(false);
      return;
    }

    setProgress(100);
    setDownloadUrl(result.url ?? null);
    setRenderWarnings(result.renderWarnings ?? []);
    setIsExporting(false);
  }, []);

  return { exportVideo, isExporting, progress, error, downloadUrl, renderWarnings, resetExportState };
}
