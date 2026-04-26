import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ImageStatus } from '@/types/storyboardTypes';
import { extractInsufficientCreditsError, routeToBillingTopUp } from '@/lib/billing-errors';

interface UseAIGenerationProps {
  shotId: string;
  isGeneratingRef: React.MutableRefObject<boolean>;
  setIsGeneratingPrompt: (isGenerating: boolean) => void;
  setIsGeneratingImage: (isGenerating: boolean) => void;
  setLocalVisualPrompt: (prompt: string) => void;
  setLocalImageStatus: (status: ImageStatus) => void;
  localVisualPrompt: string;
}

export const useAIGeneration = ({
  shotId,
  isGeneratingRef,
  setIsGeneratingPrompt,
  setIsGeneratingImage,
  setLocalVisualPrompt,
  setLocalImageStatus,
  localVisualPrompt
}: UseAIGenerationProps) => {

  const handleGenerateVisualPrompt = async () => {
    if (isGeneratingRef.current) {
      toast.info("Already working on this shot");
      return;
    }

    try {
      // Set UI state
      setIsGeneratingPrompt(true);
      isGeneratingRef.current = true;
      
      // Call our edge function to generate the visual prompt
      const { data, error } = await supabase.functions.invoke('generate-visual-prompt', {
        body: { shot_id: shotId }
      });
      
      if (error) {
        // Parse the error context if available
        let errorDetail = error.message || 'Failed to generate visual prompt';
        try {
          const parsed = typeof error.context === 'string' ? JSON.parse(error.context) : error.context;
          if (parsed?.error) errorDetail = parsed.error;
        } catch {}
        throw new Error(errorDetail);
      }
      
      // Handle non-2xx responses embedded in data
      if (data && data.success === false) {
        throw new Error(data.error || 'Failed to generate visual prompt');
      }
      
      if (data?.visual_prompt) {
        // Update local state for immediate UI feedback
        setLocalVisualPrompt(data.visual_prompt);
        
        // The backend will automatically transition to generating the image
        // We don't need to call generate-shot-image directly
        setLocalImageStatus('prompt_ready');
        toast.success('Visual prompt generated!');
      } else {
        throw new Error('No visual prompt returned');
      }
    } catch (error: any) {
      console.error('Error generating visual prompt:', error);
      toast.error(`Failed to generate visual prompt: ${error.message}`);
    } finally {
      setIsGeneratingPrompt(false);
      isGeneratingRef.current = false;
    }
  };

  const handleGenerateImage = async () => {
    if (isGeneratingRef.current) {
      toast.info("Already working on this shot");
      return;
    }
    
    // Check if we have a visual prompt
    if (!localVisualPrompt) {
      toast.info("Please generate a visual prompt first");
      return;
    }

    try {
      // Set UI state
      setIsGeneratingImage(true);
      isGeneratingRef.current = true;
      setLocalImageStatus('generating');
      
      // Call our edge function to generate the image
      const { data, error } = await supabase.functions.invoke('generate-shot-image', {
        body: { shot_id: shotId }
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
      
      // The image URL will be updated via realtime subscription
      toast.success('Image generation started');
      
    } catch (error: any) {
      console.error('Error generating image:', error);
      toast.error(`Failed to generate image: ${error.message}`);
      setLocalImageStatus('failed');
    } finally {
      // We don't reset isGeneratingImage here since we want to keep showing the loading
      // state until the realtime subscription updates the status
      isGeneratingRef.current = false;
    }
  };

  return { handleGenerateVisualPrompt, handleGenerateImage };
};
