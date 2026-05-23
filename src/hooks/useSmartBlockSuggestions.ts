import { useMemo } from 'react';

export interface BlockSuggestion {
  type: 'text' | 'image' | 'imageEdit' | 'video';
  confidence: number;
  reason: string;
}

interface UseSmartBlockSuggestionsProps {
  sourceBlockType?: 'text' | 'image' | 'imageEdit' | 'video';
  sourceBlockContent?: string;
  connectionType?: 'output' | 'input';
}

export const useSmartBlockSuggestions = ({
  sourceBlockType,
  sourceBlockContent,
  connectionType = 'output',
}: UseSmartBlockSuggestionsProps) => {
  const suggestions = useMemo(() => {
    const results: BlockSuggestion[] = [];

    if (!sourceBlockType) {
      return [
        { type: 'text', confidence: 0.28, reason: 'Generate text content' },
        { type: 'image', confidence: 0.28, reason: 'Create visual content' },
        { type: 'imageEdit', confidence: 0.24, reason: 'Composite and edit layers' },
        { type: 'video', confidence: 0.2, reason: 'Generate video' },
      ];
    }

    if (sourceBlockType === 'text') {
      if (connectionType === 'output') {
        results.push(
          { type: 'image', confidence: 0.5, reason: 'Visualize text as image' },
          { type: 'imageEdit', confidence: 0.3, reason: 'Send prompt into a compositor' },
          { type: 'text', confidence: 0.15, reason: 'Transform or summarize' },
          { type: 'video', confidence: 0.05, reason: 'Create video from concept' }
        );
      } else {
        results.push(
          { type: 'text', confidence: 0.6, reason: 'Process with more text' },
          { type: 'image', confidence: 0.4, reason: 'Describe or caption image' }
        );
      }
    } else if (sourceBlockType === 'image') {
      if (connectionType === 'output') {
        results.push(
          { type: 'imageEdit', confidence: 0.45, reason: 'Composite, inpaint, or split layers' },
          { type: 'text', confidence: 0.3, reason: 'Describe or analyze image' },
          { type: 'video', confidence: 0.15, reason: 'Animate the image' },
          { type: 'image', confidence: 0.1, reason: 'Create variation' }
        );
      } else {
        results.push(
          { type: 'text', confidence: 0.7, reason: 'Add prompt or description' },
          { type: 'image', confidence: 0.3, reason: 'Combine images' }
        );
      }
    } else if (sourceBlockType === 'imageEdit') {
      if (connectionType === 'output') {
        results.push(
          { type: 'image', confidence: 0.45, reason: 'Export the composited image' },
          { type: 'video', confidence: 0.3, reason: 'Animate the final composition' },
          { type: 'text', confidence: 0.25, reason: 'Describe or document the composition' }
        );
      } else {
        results.push(
          { type: 'image', confidence: 0.6, reason: 'Add another image layer' },
          { type: 'text', confidence: 0.4, reason: 'Provide edit instructions or prompts' }
        );
      }
    } else if (sourceBlockType === 'video') {
      if (connectionType === 'output') {
        results.push(
          { type: 'text', confidence: 0.6, reason: 'Transcribe or describe' },
          { type: 'image', confidence: 0.3, reason: 'Extract key frames' },
          { type: 'video', confidence: 0.1, reason: 'Transform video' }
        );
      }
    }

    if (sourceBlockContent) {
      const lowerContent = sourceBlockContent.toLowerCase();

      const imageKeywords = ['image', 'picture', 'photo', 'visual', 'draw', 'paint', 'scene', 'landscape'];
      if (imageKeywords.some((keyword) => lowerContent.includes(keyword))) {
        const imageIndex = results.findIndex((suggestion) => suggestion.type === 'image');
        if (imageIndex >= 0) {
          results[imageIndex].confidence += 0.15;
        }

        const imageEditIndex = results.findIndex((suggestion) => suggestion.type === 'imageEdit');
        if (imageEditIndex >= 0) {
          results[imageEditIndex].confidence += 0.1;
        }
      }

      const videoKeywords = ['video', 'animation', 'motion', 'animate', 'movie', 'clip'];
      if (videoKeywords.some((keyword) => lowerContent.includes(keyword))) {
        const videoIndex = results.findIndex((suggestion) => suggestion.type === 'video');
        if (videoIndex >= 0) {
          results[videoIndex].confidence += 0.15;
        }
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }, [sourceBlockContent, sourceBlockType, connectionType]);

  return suggestions;
};
