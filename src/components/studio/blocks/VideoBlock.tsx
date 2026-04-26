import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Info, Video, Download, RotateCw, Save, Loader2 } from 'lucide-react';
import BlockBase, { ConnectionPoint } from './BlockBase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useGeminiVideo } from '@/hooks/useGeminiVideo';
import { BlockFloatingToolbar } from './BlockFloatingToolbar';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useSaveToProjectAssets } from '@/hooks/useSaveToProjectAssets';
import { parseSettingsOverride } from '@/lib/falModelNormalization';
import { cn } from '@/lib/utils';

export interface VideoBlockProps {
  id: string;
  onSelect: () => void;
  isSelected: boolean;
  supportsConnections?: boolean;
  connectionPoints?: ConnectionPoint[];
  onStartConnection?: (blockId: string, pointId: string, e: React.MouseEvent) => void;
  onFinishConnection?: (blockId: string, pointId: string) => void;
  onShowHistory?: () => void;
  onDragEnd?: (position: { x: number, y: number }) => void;
  onRegisterRef?: (blockId: string, element: HTMLElement | null, connectionPoints: Record<string, { x: number; y: number }>) => void;
  onConnectionPointClick?: (blockId: string, point: 'top' | 'right' | 'bottom' | 'left', e: React.MouseEvent) => void;
  getInput?: (blockId: string, inputId: string) => any;
  setOutput?: (blockId: string, outputId: string, value: any) => void;
  connectedPoints?: Array<'top' | 'right' | 'bottom' | 'left'>;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  settings?: Record<string, unknown>;
  settingsOverride?: Record<string, unknown> | string;
  onUpdateParams?: (params: Record<string, unknown>) => void;
}

const VideoBlock: React.FC<VideoBlockProps> = ({ 
  id, 
  onSelect, 
  isSelected,
  supportsConnections,
  connectionPoints,
  onStartConnection,
  onFinishConnection,
  onShowHistory,
  onDragEnd,
  onRegisterRef,
  onConnectionPointClick,
  getInput,
  setOutput,
  connectedPoints = [],
  onInputFocus,
  onInputBlur,
  selectedModel: externalSelectedModel,
  onModelChange: externalOnModelChange,
  settings,
  settingsOverride,
  onUpdateParams,
}) => {
  const [mode, setMode] = useState<'suggestions' | 'prompt' | 'display'>('suggestions');
  const [prompt, setPrompt] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [durationSeconds, setDurationSeconds] = useState<number>(5);
  const [fps, setFps] = useState<number>(24);
  const [generateAudio, setGenerateAudio] = useState<boolean>(true);
  const [showSettingsOverride, setShowSettingsOverride] = useState(false);
  const [settingsOverrideText, setSettingsOverrideText] = useState<string>(
    typeof settingsOverride === 'string'
      ? settingsOverride
      : settingsOverride && typeof settingsOverride === 'object'
      ? JSON.stringify(settingsOverride, null, 2)
      : ''
  );
  const [settingsOverrideError, setSettingsOverrideError] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames] = useState(120);
  const [generationStage, setGenerationStage] = useState<string>('Initializing');
  const [estimatedTime, setEstimatedTime] = useState(45);
  const { isGenerating, videoUrl, progress, generateVideo } = useGeminiVideo();
  const { projectId } = useParams<{ projectId?: string }>();
  const { saveAsset, isSaving } = useSaveToProjectAssets(projectId);

  useEffect(() => {
    if (settings?.aspect_ratio) {
      setAspectRatio(String(settings.aspect_ratio));
    }
    if (settings?.duration !== undefined && settings?.duration !== null) {
      const parsed = Number(settings.duration);
      if (!Number.isNaN(parsed)) setDurationSeconds(parsed);
    } else if (settings?.duration_seconds !== undefined && settings?.duration_seconds !== null) {
      const parsed = Number(settings.duration_seconds);
      if (!Number.isNaN(parsed)) setDurationSeconds(parsed);
    }
    if (settings?.fps !== undefined && settings?.fps !== null) {
      const parsedFps = Number(settings.fps);
      if (!Number.isNaN(parsedFps)) setFps(parsedFps);
    }
    if (settings?.generate_audio !== undefined) {
      setGenerateAudio(Boolean(settings.generate_audio));
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

  const persistVideoSettings = useCallback(
    (nextSettings: Record<string, unknown>, overrideText: string = settingsOverrideText) => {
      const parsed = parseSettingsOverride(overrideText);
      if (!parsed.valid) {
        setSettingsOverrideError(parsed.error);
      } else {
        setSettingsOverrideError(null);
      }

      onUpdateParams?.({
        settings: nextSettings,
        settings_override: parsed.valid ? parsed.data : undefined,
        aspectRatio: nextSettings.aspect_ratio,
        duration: nextSettings.duration,
        fps: nextSettings.fps,
        generateAudio: nextSettings.generate_audio,
      });

      return parsed;
    },
    [onUpdateParams, settingsOverrideText]
  );

  // Simulate detailed generation progress
  useEffect(() => {
    if (isGenerating) {
      const stages = ['Initializing', 'Generating frames', 'Rendering', 'Finalizing'];
      let stageIndex = 0;
      
      const interval = setInterval(() => {
        setCurrentFrame(prev => Math.min(prev + Math.floor(Math.random() * 5) + 1, totalFrames));
        setEstimatedTime(prev => Math.max(0, prev - 1));
        
        const newStageIndex = Math.floor((currentFrame / totalFrames) * stages.length);
        if (newStageIndex !== stageIndex && newStageIndex < stages.length) {
          stageIndex = newStageIndex;
          setGenerationStage(stages[stageIndex]);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else if (videoUrl) {
      setCurrentFrame(totalFrames);
      setEstimatedTime(0);
    }
  }, [isGenerating, videoUrl, currentFrame, totalFrames]);

  // Use external model if provided, otherwise use default
  const selectedModel = externalSelectedModel || 'gemini-2.5-flash-video';
  const getModelDisplayName = (modelId: string) => {
    if (modelId === 'gemini-2.5-flash-video') return 'Veo 3 Fast';
    if (modelId === 'luma-dream') return 'Luma Dream';
    return 'Veo 3 Fast';
  };

  // Check for connected input and use it as prompt if available
  React.useEffect(() => {
    if (getInput) {
      const connectedInput = getInput(id, 'prompt-input');
      if (connectedInput && typeof connectedInput === 'string') {
        setPrompt(connectedInput);
      }
    }
  }, [getInput, id]);

  // Update output whenever video is generated
  React.useEffect(() => {
    if (videoUrl && setOutput) {
      setOutput(id, 'video-output', videoUrl);
    }
  }, [videoUrl, setOutput, id]);

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    const overrideParsed = parseSettingsOverride(settingsOverrideText);
    if (!overrideParsed.valid) {
      setSettingsOverrideError(overrideParsed.error);
      toast.error(overrideParsed.error);
      return;
    }
    setSettingsOverrideError(null);

    const runtimeSettings = {
      aspect_ratio: aspectRatio,
      duration: durationSeconds,
      duration_seconds: durationSeconds,
      fps,
      generate_audio: generateAudio,
    };
    persistVideoSettings(runtimeSettings, settingsOverrideText);

    setMode('prompt');
    setCurrentFrame(0);
    setEstimatedTime(45);
    setGenerationStage('Initializing');
    generateVideo(prompt, selectedModel, undefined, {
      duration: durationSeconds,
      aspectRatio,
      fps,
      generateAudio,
      settings: runtimeSettings,
      settingsOverride: overrideParsed.data,
    });
  };

  const handleSelectSuggestion = (suggestionText: string) => {
    setPrompt(suggestionText);
    setMode('prompt');
  };

  const handleDownload = async (videoUrl: string) => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `generated-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Video downloaded');
    } catch (error) {
      toast.error('Failed to download video');
    }
  };

  const handleModelChange = (modelId: string) => {
    if (externalOnModelChange) {
      externalOnModelChange(modelId);
    }
  };

  const handleAspectRatioChange = (ratio: string) => {
    setAspectRatio(ratio);
    persistVideoSettings({
      aspect_ratio: ratio,
      duration: durationSeconds,
      duration_seconds: durationSeconds,
      fps,
      generate_audio: generateAudio,
    });
  };

  const handleDurationChange = (value: number) => {
    setDurationSeconds(value);
    persistVideoSettings({
      aspect_ratio: aspectRatio,
      duration: value,
      duration_seconds: value,
      fps,
      generate_audio: generateAudio,
    });
  };

  const handleFpsChange = (value: number) => {
    setFps(value);
    persistVideoSettings({
      aspect_ratio: aspectRatio,
      duration: durationSeconds,
      duration_seconds: durationSeconds,
      fps: value,
      generate_audio: generateAudio,
    });
  };

  const handleGenerateAudioChange = (value: boolean) => {
    setGenerateAudio(value);
    persistVideoSettings({
      aspect_ratio: aspectRatio,
      duration: durationSeconds,
      duration_seconds: durationSeconds,
      fps,
      generate_audio: value,
    });
  };

  const generatedVideo = videoUrl ? { url: videoUrl } : null;

  const handleSaveToProject = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!generatedVideo?.url) {
      toast.error('No video available to save.');
      return;
    }

    await saveAsset({
      url: generatedVideo.url,
      type: 'video',
      prompt,
      model: selectedModel,
    });
  }, [generatedVideo?.url, prompt, saveAsset, selectedModel]);

  return (
    <BlockBase
      id={id}
      type="video"
      title="Video"
      onSelect={onSelect}
      isSelected={isSelected}
      model={getModelDisplayName(selectedModel)}
      onRegisterRef={onRegisterRef}
      onConnectionPointClick={onConnectionPointClick}
      connectedPoints={connectedPoints}
      toolbar={
        <BlockFloatingToolbar
          blockType="video"
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          aspectRatio={aspectRatio}
          onAspectRatioChange={handleAspectRatioChange}
        />
      }
    >
      {/* Suggestions Mode - Enhanced Empty State */}
      {mode === 'suggestions' && (
        <div className="space-y-1.5 mb-3">
          <button
            className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
            onClick={() => toast.info(
              <div className="space-y-2">
                <p className="font-semibold">Video Block</p>
                <p>Generate AI videos from text prompts using Veo 3 or Luma Dream models.</p>
                <ul className="text-xs space-y-1 list-disc pl-4">
                  <li>Describe scenes, cinematography, and motion</li>
                  <li>Videos are generated at high quality</li>
                  <li>Connect to other blocks for complex workflows</li>
                </ul>
              </div>,
              { duration: 6000 }
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
              <Info className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <span className="flex-1">Learn about Video Blocks</span>
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
          </button>
          
          <div className="pt-2 pb-1 px-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Try to...</p>
          </div>
          
          <button 
            className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
            onClick={() => {
              setPrompt('Cinematic drone shot flying over a misty mountain range at golden hour');
              setMode('prompt');
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/20 transition-colors text-base">
              🏔️
            </div>
            <span className="flex-1">Create cinematic drone footage</span>
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
          </button>
          <button 
            className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
            onClick={() => {
              setPrompt('Time-lapse of a sunset over a calm ocean with vibrant colors');
              setMode('prompt');
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20 transition-colors text-base">
              🌅
            </div>
            <span className="flex-1">Generate time-lapse sequence</span>
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
          </button>
          <button 
            className="w-full flex items-center gap-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 p-3 rounded-lg transition-all text-left text-xs group border border-transparent hover:border-zinc-700/50"
            onClick={() => {
              setPrompt('Abstract morphing shapes with neon colors in a dark environment');
              setMode('prompt');
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/20 transition-colors text-base">
              ✨
            </div>
            <span className="flex-1">Create abstract visual effects</span>
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
          </button>
        </div>
      )}

      {/* Prompt Mode with Loading State */}
      {mode === 'prompt' && (
        <div className="space-y-3">
          {isGenerating ? (
            <>
              {/* Loading Visualization */}
              <div className="aspect-video rounded-xl bg-zinc-900/50 border border-zinc-800/30 relative overflow-hidden">
                {/* Animated Progress Overlay */}
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-red-500/5"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* Timer Badge */}
                <div className="absolute top-3 right-3">
                  <Badge className="bg-black/60 text-white text-xs backdrop-blur-sm border-0">
                    ~{estimatedTime}s
                  </Badge>
                </div>
                
                {/* Bottom Progress Info */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="text-xs text-zinc-400 mb-2 flex items-center justify-between">
                    <span className="truncate flex-1">{prompt}</span>
                    <span className="ml-2 shrink-0">{generationStage}</span>
                  </div>
                  <div className="h-1 bg-zinc-800/50 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Prompt Input */}
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => {
                    e.stopPropagation();
                    onInputFocus?.();
                  }}
                  onBlur={() => onInputBlur?.()}
                  className="min-h-[80px] bg-zinc-900/50 border-zinc-800/40 text-zinc-100 placeholder:text-zinc-500 resize-none pr-20"
                  placeholder='Try "A serene waterfall in a lush forest..."'
                  disabled={isGenerating}
                />
                <div className="absolute bottom-2 right-2">
                  <Button
                    size="icon"
                    className="h-7 w-7 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerate();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    disabled={isGenerating || !prompt.trim()}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-[11px] text-zinc-400">
                  <span>Duration</span>
                  <select
                    value={durationSeconds}
                    onChange={(event) => handleDurationChange(Number(event.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value={4}>4s</option>
                    <option value={5}>5s</option>
                    <option value={8}>8s</option>
                    <option value={10}>10s</option>
                  </select>
                </label>
                <label className="space-y-1 text-[11px] text-zinc-400">
                  <span>FPS</span>
                  <select
                    value={fps}
                    onChange={(event) => handleFpsChange(Number(event.target.value))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value={16}>16</option>
                    <option value={24}>24</option>
                    <option value={30}>30</option>
                  </select>
                </label>
                <label className="space-y-1 text-[11px] text-zinc-400">
                  <span>Audio</span>
                  <select
                    value={generateAudio ? 'on' : 'off'}
                    onChange={(event) => handleGenerateAudioChange(event.target.value === 'on')}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
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
                        placeholder='{"seed": 42}'
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
            </>
          )}
        </div>
      )}

      {/* Display Mode */}
      {mode === 'display' && generatedVideo && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-3"
        >
          <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
            <video
              src={generatedVideo.url}
              className="w-full h-full object-contain"
              loop
              muted={isMuted}
              autoPlay
              playsInline
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-zinc-400 hover:text-zinc-200"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(generatedVideo.url);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-zinc-400 hover:text-zinc-200"
              onClick={handleSaveToProject}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              Save to Project
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={(e) => {
                e.stopPropagation();
                handleGenerate();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isGenerating}
            >
              <RotateCw className="w-3.5 h-3.5 mr-1.5" />
              Regenerate
            </Button>
          </div>
        </motion.div>
      )}
    </BlockBase>
  );
};

export default VideoBlock;
