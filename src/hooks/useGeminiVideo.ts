import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/integrations/supabase/config';
import { toast } from 'sonner';
import { buildCanonicalFalInputs, normalizeFalModelId } from '@/lib/falModelNormalization';

// Models that use Luma API
const LUMA_MODELS = ['luma-dream', 'luma-ray'];

export const useGeminiVideo = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const checkLumaStatus = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('gemini-video-generation', {
        body: { jobId: id }
      });

      if (error) throw error;

      setProgress(data.progress);

      if (data.status === 'completed' && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setIsGenerating(false);
        toast.success('Video generated successfully');
        return true;
      } else if (data.status === 'failed') {
        throw new Error('Video generation failed');
      }

      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check video status';
      setError(errorMessage);
      setIsGenerating(false);
      toast.error(errorMessage);
      return true;
    }
  };

  const generateWithFal = async (
    prompt: string,
    model: string,
    imageUrl?: string,
    options?: {
      duration?: number | string;
      aspectRatio?: string;
      fps?: number;
      generateAudio?: boolean;
      settings?: Record<string, unknown>;
      settingsOverride?: Record<string, unknown>;
    }
  ) => {
    const normalizedRequestedModel = normalizeFalModelId(
      model || 'fal-ai/kling-video/o3/standard/text-to-video'
    );
    const rawInputs: Record<string, unknown> = {
      prompt,
      aspect_ratio: options?.aspectRatio || '16:9',
      duration: String(options?.duration ?? 5),
      duration_seconds: Number(options?.duration ?? 5),
    };

    if (typeof options?.fps === 'number') {
      rawInputs.fps = options.fps;
    }
    if (typeof options?.generateAudio === 'boolean') {
      rawInputs.generate_audio = options.generateAudio;
    }
    if (options?.settings && typeof options.settings === 'object') {
      rawInputs.settings = options.settings;
    }
    if (options?.settingsOverride && typeof options.settingsOverride === 'object') {
      rawInputs.settings_override = options.settingsOverride;
    }

    // Add image for image-to-video
    if (imageUrl) {
      rawInputs.image_url = imageUrl;
    }

    const canonical = buildCanonicalFalInputs(normalizedRequestedModel, rawInputs);
    const falModelId = canonical.modelId;
    const inputs = canonical.inputs;

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/fal-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            modelId: falModelId,
            inputs
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'FAL API error');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'progress') {
              setProgress(prev => Math.min(prev + 10, 90));
            } else if (data.type === 'done') {
              const result = data.result;
              const url = result?.video?.url || result?.url;
              
              if (url) {
                setVideoUrl(url);
                setProgress(100);
                toast.success('Video generated successfully');
              } else {
                throw new Error('No video URL in response');
              }
              setIsGenerating(false);
              return;
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch {
            // Ignore partial/incomplete chunks until the next SSE frame arrives.
          }
        }
      }

      setIsGenerating(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'FAL video generation failed';
      setError(errorMessage);
      setIsGenerating(false);
      toast.error(errorMessage);
    }
  };

  const generateWithLuma = async (prompt: string, imageUrl?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('gemini-video-generation', {
        body: { prompt, imageUrl }
      });

      if (error) throw error;

      setJobId(data.jobId);
      toast.success('Video generation started');

      // Poll for completion
      const pollInterval = setInterval(async () => {
        const completed = await checkLumaStatus(data.jobId);
        if (completed) {
          clearInterval(pollInterval);
        }
      }, 5000);

      return () => clearInterval(pollInterval);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start video generation';
      setError(errorMessage);
      setIsGenerating(false);
      toast.error(errorMessage);
    }
  };

  const generateVideo = async (
    prompt: string,
    model: string = 'fal-ai/kling-video/o3/standard/text-to-video',
    imageUrl?: string,
    options?: {
      duration?: number | string;
      aspectRatio?: string;
      fps?: number;
      generateAudio?: boolean;
      settings?: Record<string, unknown>;
      settingsOverride?: Record<string, unknown>;
    }
  ) => {
    setIsGenerating(true);
    setError(null);
    setVideoUrl(null);
    setProgress(0);

    const useLuma = LUMA_MODELS.some((lm) => model.includes(lm)) && !model.startsWith('fal-ai/');

    if (useLuma) {
      await generateWithLuma(prompt, imageUrl);
    } else {
      await generateWithFal(prompt, model, imageUrl, options);
    }
  };

  return { isGenerating, videoUrl, progress, error, generateVideo };
};
