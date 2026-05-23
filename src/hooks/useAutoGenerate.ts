import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  isRateLimitError,
  processWithAdaptiveConcurrency,
} from '@/utils/processWithAdaptiveConcurrency';
import { extractInsufficientCreditsError, routeToBillingTopUp } from '@/lib/billing-errors';

type GenerationPhase = 'idle' | 'images' | 'videos' | 'complete';

interface ShotData {
  id: string;
  image_url: string | null;
  image_status: string;
  video_url: string | null;
  video_status: string;
  visual_prompt?: string;
}

interface AutoGenerateState {
  phase: GenerationPhase;
  progress: {
    total: number;
    completed: number;
    current: string | null;
    active: number;
    concurrency: number;
  };
  errors: Array<{ shotId: string; error: string }>;
}

const isRetryableError = (error: unknown) => {
  if (isRateLimitError(error)) return true;
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : JSON.stringify(error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('temporarily unavailable') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

export function useAutoGenerate(sceneId: string) {
  const [state, setState] = useState<AutoGenerateState>({
    phase: 'idle',
    progress: {
      total: 0,
      completed: 0,
      current: null,
      active: 0,
      concurrency: 0,
    },
    errors: [],
  });
  const [shots, setShots] = useState<ShotData[]>([]);

  const isRunningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const rateLimitNotifiedRef = useRef(false);

  const fetchShots = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('shots')
        .select('id, image_url, image_status, video_url, video_status, visual_prompt')
        .eq('scene_id', sceneId)
        .order('shot_number');

      if (error) throw error;
      const nextShots = (data || []) as ShotData[];
      setShots(nextShots);
      return nextShots;
    } catch (error) {
      console.error('Failed to fetch shots:', error);
      return [] as ShotData[];
    }
  }, [sceneId]);

  const determinePhase = useCallback((shotsData: ShotData[]): 'images' | 'videos' => {
    if (shotsData.length === 0) return 'images';
    const allHaveImages = shotsData.every((shot) => shot.image_status === 'completed' && shot.image_url);
    return allHaveImages ? 'videos' : 'images';
  }, []);

  const getShotsToProcess = useCallback(
    (phase: 'images' | 'videos', shotsData: ShotData[]): ShotData[] => {
      if (phase === 'images') {
        return shotsData.filter((shot) => shot.image_status !== 'completed' || !shot.image_url);
      }

      return shotsData.filter(
        (shot) =>
          shot.image_status === 'completed' &&
          !!shot.image_url &&
          shot.video_status !== 'completed'
      );
    },
    []
  );

  const generateImage = useCallback(async (shot: ShotData) => {
    if (!shot.visual_prompt) {
      const { error: promptError } = await supabase.functions.invoke('generate-visual-prompt', {
        body: { shot_id: shot.id },
      });
      if (promptError) throw new Error(promptError.message || 'Failed to generate visual prompt');
    }

    const { error } = await supabase.functions.invoke('generate-shot-image', {
      body: { shot_id: shot.id },
    });
    if (error) {
      const insufficient = await extractInsufficientCreditsError(error);
      if (insufficient) {
        routeToBillingTopUp(insufficient);
        throw new Error(
          `Insufficient credits. Required ${Math.ceil(insufficient.required)} / available ${Math.ceil(
            insufficient.available
          )}.`
        );
      }
      throw new Error(error.message || 'Failed to generate image');
    }
  }, []);

  const generateVideo = useCallback(async (shot: ShotData) => {
    const { error } = await supabase.functions.invoke('generate-video-from-image', {
      body: {
        shot_id: shot.id,
        image_url: shot.image_url,
        prompt: shot.visual_prompt,
        duration: 6,
        resolution: '1920x1080',
        fps: 25,
        generate_audio: true,
      },
    });
    if (error) {
      const insufficient = await extractInsufficientCreditsError(error);
      if (insufficient) {
        routeToBillingTopUp(insufficient);
        throw new Error(
          `Insufficient credits. Required ${Math.ceil(insufficient.required)} / available ${Math.ceil(
            insufficient.available
          )}.`
        );
      }
      throw new Error(error.message || 'Failed to generate video');
    }
  }, []);

  const cancelAutoGenerate = useCallback(() => {
    if (!isRunningRef.current) return;
    abortRef.current?.abort();
    abortRef.current = null;
    isRunningRef.current = false;
    setState((prev) => ({
      ...prev,
      phase: 'idle',
      progress: {
        ...prev.progress,
        current: null,
        active: 0,
      },
    }));
    toast.info('Scene auto-generate cancelled');
  }, []);

  const startAutoGenerate = useCallback(async () => {
    if (isRunningRef.current) {
      toast.info('Generation already in progress');
      return;
    }

    const shotsData = await fetchShots();
    if (shotsData.length === 0) {
      toast.error('No shots to process');
      return;
    }

    const phase = determinePhase(shotsData);
    const shotsToProcess = getShotsToProcess(phase, shotsData);

    if (shotsToProcess.length === 0) {
      if (phase === 'images') {
        toast.info('All images already generated. Click again to generate videos.');
        setState({
          phase: 'videos',
          progress: { total: 0, completed: 0, current: null, active: 0, concurrency: 0 },
          errors: [],
        });
      } else {
        toast.success('All content already generated');
        setState({
          phase: 'complete',
          progress: { total: 0, completed: 0, current: null, active: 0, concurrency: 0 },
          errors: [],
        });
      }
      return;
    }

    const initialConcurrency = phase === 'images' ? 4 : 2;
    const abortController = new AbortController();
    abortRef.current = abortController;
    isRunningRef.current = true;
    rateLimitNotifiedRef.current = false;

    setState({
      phase,
      progress: {
        total: shotsToProcess.length,
        completed: 0,
        current: null,
        active: 0,
        concurrency: initialConcurrency,
      },
      errors: [],
    });

    toast.info(
      `Starting ${phase === 'images' ? 'image' : 'video'} generation for ${shotsToProcess.length} shots`
    );

    const { results, errors } = await processWithAdaptiveConcurrency({
      items: shotsToProcess,
      initialConcurrency,
      minConcurrency: 1,
      maxRetries: 2,
      isCancelled: () => abortController.signal.aborted,
      shouldRetry: isRetryableError,
      onRateLimit: () => {
        if (!rateLimitNotifiedRef.current) {
          rateLimitNotifiedRef.current = true;
          toast.warning('Rate limit detected. Reducing concurrency to stabilize generation.');
        }
      },
      onProgress: ({ completed, active, concurrency }) => {
        setState((prev) => ({
          ...prev,
          progress: {
            ...prev.progress,
            completed,
            active,
            concurrency,
          },
        }));
      },
      processor: async (shot) => {
        if (abortController.signal.aborted) {
          throw new Error('Cancelled');
        }

        setState((prev) => ({
          ...prev,
          progress: {
            ...prev.progress,
            current: shot.id,
          },
        }));

        if (phase === 'images') {
          await generateImage(shot);
        } else {
          await generateVideo(shot);
        }

        return shot.id;
      },
    });

    const wasCancelled = abortController.signal.aborted;
    const mappedErrors = errors.map((entry) => ({
      shotId: shotsToProcess[entry.itemIndex]?.id ?? 'unknown',
      error: getErrorMessage(entry.error),
    }));
    const successCount = results.filter((entry) => entry?.success).length;

    setState((prev) => ({
      ...prev,
      phase: wasCancelled ? 'idle' : phase === 'images' ? 'videos' : 'complete',
      errors: mappedErrors,
      progress: {
        ...prev.progress,
        current: null,
        active: 0,
      },
    }));

    await fetchShots();
    isRunningRef.current = false;
    abortRef.current = null;

    if (wasCancelled) {
      toast.info('Generation cancelled');
      return;
    }

    if (mappedErrors.length > 0) {
      toast.warning(
        `Completed ${successCount}/${shotsToProcess.length} ${phase}. ${mappedErrors.length} failed.`
      );
      return;
    }

    toast.success(
      `${phase === 'images' ? 'Images' : 'Videos'} generated successfully (${successCount}/${shotsToProcess.length})`
    );
  }, [determinePhase, fetchShots, generateImage, generateVideo, getShotsToProcess]);

  return {
    state,
    shots,
    startAutoGenerate,
    cancelAutoGenerate,
    nextPhase: shots.length > 0 ? determinePhase(shots) : 'images',
    isProcessing: isRunningRef.current || (state.phase !== 'idle' && state.phase !== 'complete'),
    fetchShots,
  };
}
