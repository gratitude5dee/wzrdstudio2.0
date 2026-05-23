import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import BlockBase from './BlockBase';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useGeminiImage } from '@/hooks/useGeminiImage';
import { falAI, FalStreamEvent } from '@/lib/falai-client';
import { Download, Copy, Maximize2, Sparkles, Info, Upload, Video, MessageSquare, Send, Plus, Loader2, HelpCircle, Film, Save } from 'lucide-react';
import { toast } from 'sonner';
import { BlockFloatingToolbar } from './BlockFloatingToolbar';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useSaveToProjectAssets } from '@/hooks/useSaveToProjectAssets';
import { parseSettingsOverride } from '@/lib/falModelNormalization';
import { cn } from '@/lib/utils';

interface StreamProgress {
  status: string;
  progress: number;
  queuePosition?: number;
  logs?: string[];
}

interface ImageBlockProps {
  id: string;
  onSelect: () => void;
  isSelected: boolean;
  onRegisterRef?: (blockId: string, element: HTMLElement | null, connectionPoints: Record<string, { x: number; y: number }>) => void;
  onConnectionPointClick?: (blockId: string, point: 'top' | 'right' | 'bottom' | 'left', e: React.MouseEvent) => void;
  getInput?: (blockId: string, inputId: string) => any;
  setOutput?: (blockId: string, outputId: string, value: any) => void;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  connectedPoints?: Array<'top' | 'right' | 'bottom' | 'left'>;
  onSpawnBlocks?: (blocks: Array<{
    id: string;
    type: 'text' | 'image' | 'video';
    position: { x: number; y: number };
    initialData?: any;
  }>) => void;
  blockPosition?: { x: number; y: number };
  initialData?: {
    prompt?: string;
    imageUrl?: string;
    generationTime?: number;
    aspectRatio?: string;
  };
  displayMode?: 'input' | 'display';
  useStreaming?: boolean;
  settings?: Record<string, unknown>;
  settingsOverride?: Record<string, unknown> | string;
  onUpdateParams?: (params: Record<string, unknown>) => void;
}

const ImageBlock: React.FC<ImageBlockProps> = ({
  id,
  onSelect,
  isSelected,
  onRegisterRef,
  onConnectionPointClick,
  getInput,
  setOutput,
  selectedModel,
  onModelChange,
  connectedPoints = [],
  onSpawnBlocks,
  blockPosition = { x: 0, y: 0 },
  initialData,
  displayMode: initialDisplayMode,
  useStreaming = true,
  settings,
  settingsOverride,
  onUpdateParams,
}) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState(initialData?.prompt || '');
  const [aspectRatio, setAspectRatio] = useState(initialData?.aspectRatio || '1:1');
  const [generationCount, setGenerationCount] = useState(1);
  const [imageSize, setImageSize] = useState<string>(String(settings?.image_size ?? 'landscape_16_9'));
  const [safetyTolerance, setSafetyTolerance] = useState<string>(String(settings?.safety_tolerance ?? '3'));
  const [showSettingsOverride, setShowSettingsOverride] = useState(false);
  const [settingsOverrideText, setSettingsOverrideText] = useState<string>(
    typeof settingsOverride === 'string'
      ? settingsOverride
      : settingsOverride && typeof settingsOverride === 'object'
      ? JSON.stringify(settingsOverride, null, 2)
      : ''
  );
  const [settingsOverrideError, setSettingsOverrideError] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [displayMode, setDisplayMode] = useState<'input' | 'display'>(
    initialDisplayMode || (initialData?.imageUrl ? 'display' : 'input')
  );
  const [generatedImage, setGeneratedImage] = useState<{ url: string; generationTime?: number } | null>(
    initialData?.imageUrl ? { url: initialData.imageUrl, generationTime: initialData.generationTime } : null
  );
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState<StreamProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingVariation, setIsCreatingVariation] = useState(false);
  const [isConvertingToVideo, setIsConvertingToVideo] = useState(false);
  const { isGenerating, generateImage } = useGeminiImage();
  const { projectId } = useParams<{ projectId?: string }>();
  const { saveAsset, isSaving } = useSaveToProjectAssets(projectId);

  useEffect(() => {
    if (settings?.image_size) {
      setImageSize(String(settings.image_size));
    }
    if (settings?.safety_tolerance !== undefined && settings?.safety_tolerance !== null) {
      setSafetyTolerance(String(settings.safety_tolerance));
    }
    if (settings?.num_images !== undefined && Number(settings.num_images) > 0) {
      setGenerationCount(Number(settings.num_images));
    }
  }, [settings]);

  useEffect(() => {
    if (typeof settingsOverride === 'string') {
      setSettingsOverrideText(settingsOverride);
      return;
    }
    if (settingsOverride && typeof settingsOverride === 'object') {
      setSettingsOverrideText(JSON.stringify(settingsOverride, null, 2));
      return;
    }
    setSettingsOverrideText('');
  }, [settingsOverride]);

  const persistSettings = useCallback(
    (nextSettings: Record<string, unknown>, overrideText: string = settingsOverrideText) => {
      const parsedOverride = parseSettingsOverride(overrideText);
      if (!parsedOverride.valid) {
        setSettingsOverrideError(parsedOverride.error);
      } else {
        setSettingsOverrideError(null);
      }

      onUpdateParams?.({
        settings: nextSettings,
        settings_override: parsedOverride.valid ? parsedOverride.data : undefined,
        aspectRatio: nextSettings.aspect_ratio,
        imageSize: nextSettings.image_size,
        numImages: nextSettings.num_images,
      });

      return parsedOverride;
    },
    [onUpdateParams, settingsOverrideText]
  );

  // Handle variation generation
  const handleVariation = useCallback(async () => {
    if (!generatedImage?.url) {
      toast.error('No image to create variation from');
      return;
    }

    setIsCreatingVariation(true);
    try {
      const session = await supabase.auth.getSession();
      const result = await falAI.execute('fal-ai/flux/dev/image-to-image', {
        image_url: generatedImage.url,
        prompt: prompt || 'Create a variation of this image with subtle changes',
        strength: 0.65,
        num_images: 1,
      });

      if (result?.images?.[0]?.url) {
        setGeneratedImage({
          url: result.images[0].url,
          generationTime: result.generationTime
        });
        toast.success('Variation created!');
      } else {
        toast.error('Failed to create variation');
      }
    } catch (error) {
      console.error('Variation error:', error);
      toast.error('Failed to create variation');
    } finally {
      setIsCreatingVariation(false);
    }
  }, [generatedImage?.url, prompt]);

  // Handle file upload
  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image must be under 10MB');
        return;
      }

      setIsUploading(true);
      try {
        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const { data, error } = await supabase.storage
          .from('user-uploads')
          .upload(`images/${fileName}`, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('user-uploads')
          .getPublicUrl(`images/${fileName}`);

        setGeneratedImage({ url: publicUrl });
        setDisplayMode('display');
        toast.success('Image uploaded!');
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload image');
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  }, []);

  // Handle image to video conversion
  const handleImageToVideo = useCallback(async () => {
    if (!generatedImage?.url) {
      toast.error('No image to convert to video');
      return;
    }

    setIsConvertingToVideo(true);
    try {
      const result = await falAI.generateVideo(prompt || 'Animate this image with subtle motion', {
        image_url: generatedImage.url,
        modelId: 'fal-ai/magi/image-to-video',
        duration: 5,
      });

      if (result?.video?.url) {
        // Spawn a video node with the result
        if (onSpawnBlocks) {
          onSpawnBlocks([{
            id: uuidv4(),
            type: 'video',
            position: { x: blockPosition.x + 400, y: blockPosition.y },
            initialData: {
              videoUrl: result.video.url,
              prompt: prompt,
            },
          }]);
          toast.success('Video generated from image!');
        } else {
          // Open video in new tab if can't spawn blocks
          window.open(result.video.url, '_blank');
          toast.success('Video generated! Opening in new tab.');
        }
      } else {
        toast.error('Failed to generate video');
      }
    } catch (error) {
      console.error('Image to video error:', error);
      toast.error('Failed to generate video from image');
    } finally {
      setIsConvertingToVideo(false);
    }
  }, [generatedImage?.url, prompt, blockPosition, onSpawnBlocks]);

  // Handle video combination (navigate to video editor with image)
  const handleVideoCombination = useCallback(() => {
    if (!generatedImage?.url) {
      toast.error('No image available');
      return;
    }
    // Store images in session for video editor
    const existingImages = JSON.parse(sessionStorage.getItem('videoEditorImages') || '[]');
    existingImages.push({
      url: generatedImage.url,
      prompt: prompt,
      timestamp: Date.now(),
    });
    sessionStorage.setItem('videoEditorImages', JSON.stringify(existingImages));
    toast.success('Image added to video editor queue');
  }, [generatedImage?.url, prompt]);

  // Handle documentation/help
  const handleDocumentation = useCallback(() => {
    // Open inline help or documentation
    toast.info(
      <div className="space-y-2">
        <p className="font-medium">Image Block Help</p>
        <ul className="text-sm space-y-1 list-disc pl-4">
          <li>Enter a prompt and click Generate to create an image</li>
          <li>Use the sparkle button to enhance your prompt with AI</li>
          <li>Click the variation button to create similar images</li>
          <li>Upload existing images to use as a starting point</li>
        </ul>
      </div>,
      { duration: 8000 }
    );
  }, []);

  // Handle streaming progress
  const handleStreamProgress = (event: FalStreamEvent) => {
    if (event.type === 'progress' && event.event) {
      const progressPercent = event.event.progress || 0;
      setProgress(progressPercent * 100);
      setStreamProgress({
        status: event.event.status || 'processing',
        progress: progressPercent * 100,
        queuePosition: event.event.queue_position,
        logs: event.event.logs
      });
    }
  };

  // Simulate progress during non-streaming generation
  useEffect(() => {
    if (isGenerating && !isStreaming) {
      setProgress(0);
      setTimeRemaining(30);
      const interval = setInterval(() => {
        setProgress(prev => Math.min(prev + 2, 95));
        setTimeRemaining(prev => Math.max(prev - 1, 1));
      }, 1000);
      return () => clearInterval(interval);
    } else if (!isGenerating && !isStreaming) {
      setProgress(100);
    }
  }, [isGenerating, isStreaming]);

  const generateShortTitle = (fullPrompt: string): string => {
    const words = fullPrompt.trim().split(/\s+/);
    const significantWords = words.filter(w => 
      w.length > 3 && !['with', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for'].includes(w.toLowerCase())
    );
    return significantWords.slice(0, 3).join(' ').slice(0, 30);
  };

  const handleAspectRatioChange = (ratio: string) => {
    setAspectRatio(ratio);
    persistSettings({
      aspect_ratio: ratio,
      image_size: imageSize,
      num_images: generationCount,
      safety_tolerance: safetyTolerance,
    });
  };

  const handleGenerationCountChange = (count: number) => {
    setGenerationCount(count);
    persistSettings({
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      num_images: count,
      safety_tolerance: safetyTolerance,
    });
  };

  const handleImageSizeChange = (size: string) => {
    setImageSize(size);
    persistSettings({
      aspect_ratio: aspectRatio,
      image_size: size,
      num_images: generationCount,
      safety_tolerance: safetyTolerance,
    });
  };

  const handleSafetyToleranceChange = (value: string) => {
    setSafetyTolerance(value);
    persistSettings({
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      num_images: generationCount,
      safety_tolerance: value,
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    const overrideResult = parseSettingsOverride(settingsOverrideText);
    if (!overrideResult.valid) {
      setSettingsOverrideError(overrideResult.error);
      toast.error(overrideResult.error);
      return;
    }
    setSettingsOverrideError(null);

    const runtimeSettings = {
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      num_images: generationCount,
      safety_tolerance: safetyTolerance,
    };
    persistSettings(runtimeSettings, settingsOverrideText);
    
    console.log('🎨 Generation started:', { generationCount, prompt, aspectRatio, useStreaming });
    
    // Convert aspect ratio to Fal.ai format
    const aspectRatioMap: Record<string, string> = {
      '1:1': 'square',
      '16:9': 'landscape_16_9',
      '9:16': 'portrait_16_9',
      '4:3': 'landscape_4_3',
      '3:4': 'portrait_4_3'
    };
    const falAspectRatio = aspectRatioMap[aspectRatio] || 'landscape_4_3';
    
    if (generationCount === 1) {
      console.log('📸 Generating single image');
      
      // Use streaming if enabled
      if (useStreaming) {
        setIsStreaming(true);
        setProgress(0);
        setStreamProgress({ status: 'starting', progress: 0 });
        
        try {
          const startTime = Date.now();
          const result = await falAI.streamGenerate(
            selectedModel || 'fal-ai/flux/dev',
            {
              prompt,
              image_size: imageSize || falAspectRatio,
              num_images: 1,
              aspect_ratio: aspectRatio,
              settings: runtimeSettings,
              settings_override: overrideResult.data,
            },
            {
              onProgress: handleStreamProgress,
              onComplete: (res) => {
                console.log('✅ Streaming complete:', res);
                const generationTime = Date.now() - startTime;

                if (res?.images?.[0]?.url) {
                  setGeneratedImage({
                    url: res.images[0].url,
                    generationTime
                  });
                  setDisplayMode('display');
                  toast.success(`Image generated in ${(generationTime / 1000).toFixed(1)}s!`);
                }
              },
              onError: (error) => {
                console.error('❌ Streaming error:', error);
                toast.error(`Generation failed: ${error.message}`);
              },
            }
          );
          
          // Handle non-streaming result if callback wasn't called
          if (result?.images?.[0]?.url && !generatedImage) {
            const generationTime = Date.now() - startTime;
            setGeneratedImage({ 
              url: result.images[0].url, 
              generationTime 
            });
            setDisplayMode('display');
          }
        } finally {
          setIsStreaming(false);
          setStreamProgress(null);
        }
      } else {
        // Fallback to non-streaming
        const results = await generateImage(prompt, 1, aspectRatio);
        console.log('✅ Single image result:', results);
        if (results && results.length > 0) {
          setGeneratedImage({ 
            url: results[0].url, 
            generationTime: results[0].generationTime 
          });
          toast.success('Image generated!');
        }
      }
    } else if (generationCount > 1) {
      console.log(`🎭 Generating ${generationCount} images for spawning`);
      
      if (!onSpawnBlocks) {
        toast.error('Multi-image generation not supported in this context');
        return;
      }
      
      const results = await generateImage(prompt, generationCount, aspectRatio);
      console.log(`✅ Received ${results?.length || 0} images from generation`);
      
      if (results && results.length > 0) {
        const BLOCK_SPACING = 400;
        const BLOCKS_PER_ROW = 3;
        
        const newBlocks = results.map((img, index) => {
          const row = Math.floor(index / BLOCKS_PER_ROW);
          const col = index % BLOCKS_PER_ROW;
          
          const newBlock = {
            id: uuidv4(),
            type: 'image' as const,
            position: {
              x: blockPosition.x + (col * BLOCK_SPACING),
              y: blockPosition.y + ((row + 1) * BLOCK_SPACING)
            },
            initialData: {
              prompt: prompt,
              imageUrl: img.url,
              generationTime: img.generationTime,
              aspectRatio: aspectRatio,
              mode: 'display'
            }
          };
          
          console.log(`📦 Created block ${index + 1}:`, {
            id: newBlock.id,
            position: newBlock.position,
            hasImage: !!newBlock.initialData?.imageUrl,
            mode: newBlock.initialData.mode
          });
          
          return newBlock;
        });
        
        console.log(`🚀 Spawning ${newBlocks.length} blocks`);
        onSpawnBlocks(newBlocks);
        toast.success(`Spawned ${newBlocks.length} image blocks!`);
      } else {
        console.error('❌ No images generated');
        toast.error('Failed to generate images');
      }
    }
  };

  const handleDownload = async (imageUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Image downloaded');
    } catch (error) {
      toast.error('Failed to download image');
    }
  };

  const handleCopy = async (imageUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      toast.success('Image copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy image');
    }
  };

  const handleAISuggestion = async () => {
    if (isGeneratingPrompt) return;
    
    setIsGeneratingPrompt(true);
    try {
      const supabase = (await import('@/integrations/supabase/client')).supabase;
      
      let systemPrompt: string;
      let userPrompt: string;
      
      if (!prompt.trim()) {
        systemPrompt = "You are a creative AI assistant that generates detailed, vivid image prompts. Generate a single creative and detailed prompt for an AI image generator. Be specific about style, lighting, composition, and subject matter.";
        userPrompt = "Generate a creative image prompt";
      } else {
        systemPrompt = "You are an expert at improving image generation prompts. Enhance the given prompt by adding specific details about style, lighting, composition, colors, and atmosphere while keeping the core concept. Return only the improved prompt text.";
        userPrompt = prompt;
      }
      
      const { data, error } = await supabase.functions.invoke('gemini-text-generation', {
        body: {
          prompt: userPrompt,
          systemPrompt,
          model: 'google/gemini-2.5-flash'
        }
      });

      if (error) throw error;
      
      const generatedText = data?.choices?.[0]?.message?.content;
      if (generatedText) {
        setPrompt(generatedText.trim());
        toast.success(prompt ? 'Prompt improved!' : 'Prompt generated!');
      }
    } catch (error) {
      console.error('Error generating prompt:', error);
      toast.error('Failed to generate prompt suggestion');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleSaveToProject = useCallback(async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!generatedImage?.url) {
      toast.error('No image available to save.');
      return;
    }

    await saveAsset({
      url: generatedImage.url,
      type: 'image',
      prompt,
      model: selectedModel,
    });
  }, [generatedImage?.url, prompt, saveAsset, selectedModel]);

  // Display mode - prominent image with overlay
  if (displayMode === 'display' && generatedImage) {
    return (
      <motion.div 
        ref={blockRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-80 h-80 rounded-[20px] overflow-hidden cursor-pointer group shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        onClick={() => {
          setDisplayMode('input');
          onSelect();
        }}
      >
        <img
          src={generatedImage.url}
          alt={prompt}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        
        {/* Bottom Badge Overlay with frosted glass */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none">
          <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg max-w-[60%]">
            <span className="text-xs font-medium text-white/90 line-clamp-1">
              {generateShortTitle(prompt)}
            </span>
          </div>
          <div className="px-2.5 py-1 bg-gradient-to-r from-blue-500/90 to-purple-500/90 backdrop-blur-md border border-white/20 rounded-lg shadow-lg">
            <span className="text-[10px] font-bold text-white tracking-wide">
              {selectedModel?.includes('flux') ? '⚡ Flux' : selectedModel?.includes('recraft') ? '🎨 Recraft' : '✨ AI'}
            </span>
          </div>
        </div>

        {/* Hover actions overlay with reduced opacity */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2">
          <Button
            size="icon"
            className="bg-white/90 hover:bg-white text-black shadow-lg transform hover:scale-110 transition-transform"
            onClick={(e) => handleDownload(generatedImage.url, e)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            className="bg-white/90 hover:bg-white text-black shadow-lg"
            onClick={handleSaveToProject}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save to Project
          </Button>
          <Button
            size="icon"
            className="bg-white/90 hover:bg-white text-black shadow-lg transform hover:scale-110 transition-transform"
            onClick={(e) => handleCopy(generatedImage.url, e)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="bg-white/90 hover:bg-white text-black shadow-lg transform hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              setDisplayMode('input');
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="bg-white/90 hover:bg-white text-black shadow-lg transform hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              handleVariation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={isCreatingVariation}
          >
            {isCreatingVariation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </Button>
        </div>

        {/* Selection indicator with corner dots */}
        {isSelected && (
          <>
            <div className="absolute inset-0 border-2 border-blue-500/70 rounded-[20px] pointer-events-none shadow-[0_0_0_4px_rgba(59,130,246,0.15)]" />
            <div className="absolute top-1 left-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute bottom-1 left-1 w-2 h-2 bg-blue-500 rounded-full" />
            <div className="absolute bottom-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
          </>
        )}
      </motion.div>
    );
  }

  // Input mode - full editing interface
  return (
    <div ref={blockRef}>
      <BlockBase
        id={id}
        type="image"
        title={prompt ? generateShortTitle(prompt) : "Image Generation"}
        onSelect={onSelect}
        isSelected={isSelected}
        model={selectedModel}
        onRegisterRef={onRegisterRef}
        onConnectionPointClick={onConnectionPointClick}
        connectedPoints={connectedPoints}
        toolbar={
          <BlockFloatingToolbar
            blockType="image"
            selectedModel={selectedModel || ''}
            onModelChange={onModelChange || (() => {})}
            aspectRatio={aspectRatio}
            onAspectRatioChange={handleAspectRatioChange}
            onSettingsClick={() => {}}
            generationCount={generationCount}
            onGenerationCountChange={handleGenerationCountChange}
            onAISuggestion={handleAISuggestion}
          />
        }
      >
        <div className="space-y-3">
          {/* Empty State - Enhanced Suggestion Menu */}
          {!prompt && !generatedImage && !isGenerating && (
            <div className="space-y-1.5 mb-3">
              <button
                className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
                onClick={handleDocumentation}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="flex-1">Learn about Image Blocks</span>
                <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
              </button>
              <button
                className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
                onClick={handleUpload}
                onMouseDown={(e) => e.stopPropagation()}
                disabled={isUploading}
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/20 transition-colors">
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <span className="flex-1">{isUploading ? 'Uploading...' : 'Upload an Image'}</span>
                <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
              </button>
              <button
                className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
                onClick={handleVideoCombination}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20 transition-colors">
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <span className="flex-1">Add to video editor queue</span>
                <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
              </button>
              <button
                className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
                onClick={handleImageToVideo}
                onMouseDown={(e) => e.stopPropagation()}
                disabled={isConvertingToVideo}
              >
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/20 transition-colors">
                  {isConvertingToVideo ? <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" /> : <Video className="w-3.5 h-3.5 text-orange-400" />}
                </div>
                <span className="flex-1">{isConvertingToVideo ? 'Converting to video...' : 'Turn an image into a video'}</span>
                <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
              </button>
              <button 
                className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
                onClick={(e) => {
                  e.stopPropagation();
                  // Trigger visual intelligence workflow
                  if (onSpawnBlocks && generatedImage) {
                    const textBlockId = uuidv4();
                    const textBlock = {
                      id: textBlockId,
                      type: 'text' as const,
                      position: {
                        x: blockPosition.x + 450,
                        y: blockPosition.y
                      },
                      initialData: {
                        mode: 'visual-intelligence',
                        connectedImageUrl: generatedImage.url,
                        connectedImagePrompt: prompt
                      }
                    };
                    onSpawnBlocks([textBlock]);
                    toast.success('Visual Q&A block created! Ask your question.');
                  } else {
                    toast.info('Generate an image first');
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="flex-1">Ask a question about an image</span>
                <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
              </button>
            </div>
          )}

          {/* Prompt Input with Counter and Send */}
          <div className="relative">
            <Textarea
              placeholder='Try "An ethereal aurora over a snowy landscape"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[80px] bg-zinc-900/50 border-zinc-800/40 text-zinc-100 placeholder:text-zinc-500 resize-none pr-20"
              disabled={isGeneratingPrompt || isGenerating}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
              <Badge
                className="bg-zinc-800 text-zinc-400 text-xs border-zinc-700/50 hover:bg-zinc-700 cursor-pointer"
                onClick={() => handleGenerationCountChange(generationCount < 4 ? generationCount + 1 : 1)}
              >
                {generationCount}×
              </Badge>
              <Button
                size="icon"
                className="h-7 w-7 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleGenerate}
                disabled={isGenerating || isStreaming || !prompt.trim() || isGeneratingPrompt}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px] text-zinc-400">
              <span>Image size</span>
              <select
                value={imageSize}
                onChange={(event) => handleImageSizeChange(event.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value="square_hd">Square HD</option>
                <option value="landscape_16_9">Landscape 16:9</option>
                <option value="portrait_16_9">Portrait 9:16</option>
                <option value="landscape_4_3">Landscape 4:3</option>
                <option value="portrait_4_3">Portrait 3:4</option>
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-zinc-400">
              <span>Safety tolerance</span>
              <select
                value={safetyTolerance}
                onChange={(event) => handleSafetyToleranceChange(event.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value="1">1 (strict)</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4 (relaxed)</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-zinc-400">Settings override</label>
              <Switch
                checked={showSettingsOverride}
                onCheckedChange={setShowSettingsOverride}
                className="scale-75"
              />
            </div>
            <AnimatePresence initial={false}>
              {showSettingsOverride && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <Textarea
                    value={settingsOverrideText}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSettingsOverrideText(nextValue);
                      const parsed = parseSettingsOverride(nextValue);
                      setSettingsOverrideError(parsed.valid ? null : parsed.error);
                    }}
                    placeholder='{"seed": 12345}'
                    className={cn(
                      'min-h-[68px] bg-zinc-900/50 border-zinc-800/40 text-zinc-200 text-xs font-mono',
                      settingsOverrideError ? 'border-red-500/60' : ''
                    )}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {settingsOverrideError && (
                    <p className="text-[11px] text-red-400 mt-1">{settingsOverrideError}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Loading State with Progress */}
          {(isGenerating || isStreaming) && (
            <div className="space-y-3">
              <div className="aspect-square rounded-xl bg-zinc-900/50 border border-zinc-800/30 relative overflow-hidden">
                {/* Animated Progress Overlay */}
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* Streaming Status Badge */}
                <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
                  {streamProgress?.queuePosition !== undefined && streamProgress.queuePosition > 0 && (
                    <Badge className="bg-amber-500/80 text-white text-xs backdrop-blur-sm border-0">
                      Queue: #{streamProgress.queuePosition}
                    </Badge>
                  )}
                  <Badge className="bg-black/60 text-white text-xs backdrop-blur-sm border-0 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {streamProgress?.status || 'Generating'}
                  </Badge>
                </div>
                
                {/* Center Progress Indicator */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <svg className="w-20 h-20 -rotate-90">
                      <circle
                        cx="40"
                        cy="40"
                        r="35"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        className="text-zinc-800"
                      />
                      <motion.circle
                        cx="40"
                        cy="40"
                        r="35"
                        stroke="url(#gradient)"
                        strokeWidth="4"
                        fill="transparent"
                        strokeLinecap="round"
                        initial={{ strokeDasharray: "0 220" }}
                        animate={{ strokeDasharray: `${(progress / 100) * 220} 220` }}
                        transition={{ duration: 0.3 }}
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-semibold text-white">{Math.round(progress)}%</span>
                    </div>
                  </div>
                </div>
                
                {/* Bottom Info */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <div className="text-xs text-zinc-400 max-w-[200px] truncate">
                    {prompt}
                  </div>
                  {generationCount > 1 && (
                    <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1">
                      <Plus className="w-3 h-3 text-white" />
                      <span className="text-xs text-white">{generationCount}×</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />}
                    {isStreaming ? 'Streaming...' : 'Generating image...'}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            </div>
          )}

          {/* Generated Image with Enhanced Display */}
          {generatedImage && !isGenerating && (
            <div className="space-y-2">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative group cursor-pointer rounded-xl overflow-hidden bg-zinc-800/30 aspect-square"
              >
                <img
                  src={generatedImage.url}
                  alt="Generated"
                  className="w-full h-full object-cover"
                />

                {/* Generation Time Badge */}
                {generatedImage.generationTime && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-black/60 text-white text-xs backdrop-blur-sm border-0">
                      ~{generatedImage.generationTime}s
                    </Badge>
                  </div>
                )}

                {/* Hover Actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2">
                  <Button
                    size="icon"
                    className="bg-white/90 hover:bg-white text-black shadow-lg"
                    onClick={(e) => handleDownload(generatedImage.url, e)}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    className="bg-white/90 hover:bg-white text-black shadow-lg"
                    onClick={(e) => handleCopy(generatedImage.url, e)}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    className="bg-white/90 hover:bg-white text-black shadow-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDisplayMode('display');
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={handleSaveToProject}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  Save to Project
                </Button>
              </div>
            </div>
          )}
        </div>
      </BlockBase>
    </div>
  );
};

export default ImageBlock;
