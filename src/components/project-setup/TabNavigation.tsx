import { startTransition, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, SlidersHorizontal } from 'lucide-react';
import { useProjectContext } from './ProjectContext';
import { ProjectSetupTab } from './types';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { getModelsByTypeAndGroup } from '@/lib/studio-model-constants';
import { formatModelLabel, STORYLINE_MODEL_OPTIONS, formatStorylineModelLabel } from '@/lib/constants/credits';
import { useUserTier, sortModelsForTier } from '@/hooks/useUserTier';


const TabNavigation = () => {
  const { activeTab, setActiveTab, getVisibleTabs, projectData, updateProjectData } = useProjectContext();
  const visibleTabs = getVisibleTabs();
  const { tier } = useUserTier();

  const imageGenerationModels = useMemo(() => sortModelsForTier(getModelsByTypeAndGroup('image', 'generation'), tier), [tier]);
  const videoGenerationModels = useMemo(() => sortModelsForTier(getModelsByTypeAndGroup('video', 'generation'), tier), [tier]);
  const audioGenerationModels = useMemo(() => sortModelsForTier(getModelsByTypeAndGroup('audio', 'generation'), tier), [tier]);
  const storylineModelOptions = STORYLINE_MODEL_OPTIONS;

  const [storylineSettingsText, setStorylineSettingsText] = useState(
    JSON.stringify(projectData.storylineTextSettings || {}, null, 2)
  );
  const [storylineSettingsError, setStorylineSettingsError] = useState<string | null>(null);

  useEffect(() => {
    setStorylineSettingsText(JSON.stringify(projectData.storylineTextSettings || {}, null, 2));
  }, [projectData.storylineTextSettings]);

  const handleStorylineSettingsBlur = () => {
    const trimmed = storylineSettingsText.trim();
    if (!trimmed) {
      setStorylineSettingsError(null);
      updateProjectData({ storylineTextSettings: {} });
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setStorylineSettingsError('JSON override must be an object.');
        return;
      }
      setStorylineSettingsError(null);
      updateProjectData({ storylineTextSettings: parsed });
    } catch {
      setStorylineSettingsError('Invalid JSON syntax.');
    }
  };

  const handleTabChange = (tab: ProjectSetupTab) => {
    if (tab === activeTab) return;
    startTransition(() => {
      setActiveTab(tab);
      performance.mark(`tab:${tab}:selected`);
    });
  };

  const getTabIndex = (tab: ProjectSetupTab) => visibleTabs.indexOf(tab);
  const activeIndex = getTabIndex(activeTab);

  const getTabLabel = (tab: ProjectSetupTab) => {
    switch (tab) {
      case 'concept': return 'Concept';
      case 'storyline': return 'Storyline';
      case 'settings': return 'Settings & Cast';
      case 'breakdown': return 'Breakdown';
      default: return tab;
    }
  };

  return (
    <div className={cn(
      "border-b px-3 md:px-6 py-3 md:py-4",
      "bg-gradient-to-r from-[rgba(15,15,20,0.8)] via-[rgba(12,12,18,0.6)] to-[rgba(15,15,20,0.8)]",
      "backdrop-blur-xl border-white/[0.05]"
    )}>
      <div className="container mx-auto flex justify-start md:justify-center overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-3 px-3 md:mx-0 md:px-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-max">
          {visibleTabs.map((tab, index) => {
            const isActive = activeTab === tab;
            const isCompleted = index < activeIndex;
            const stepNumber = index + 1;

            return (
              <motion.div
                key={tab}
                className="flex items-center"
                initial={false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <button
                  onClick={() => handleTabChange(tab)}
                  className={cn(
                    "relative flex items-center gap-3 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300",
                    "backdrop-blur-md border",
                    isActive && [
                      "bg-[rgba(139,92,246,0.15)] text-[#A78BFA] border-[rgba(139,92,246,0.35)]",
                      "shadow-[0_0_28px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.05)]"
                    ],
                    isCompleted && !isActive && [
                      "bg-[rgba(139,92,246,0.1)] text-[#C4B5FD] border-[rgba(139,92,246,0.25)]"
                    ],
                    !isActive && !isCompleted && [
                      "bg-white/[0.03] text-muted-foreground border-white/[0.06]",
                      "hover:text-foreground hover:bg-white/[0.06] hover:border-white/[0.1]"
                    ]
                  )}
                >
                  <span className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all duration-300",
                    isActive && "bg-[#FF6B4A] text-white shadow-[0_0_16px_rgba(255,107,74,0.5)]",
                    isCompleted && !isActive && "bg-[rgba(255,107,74,0.7)] text-white",
                    !isActive && !isCompleted && "bg-white/[0.08] text-muted-foreground"
                  )}>
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepNumber}
                  </span>
                  
                  <span className="inline whitespace-nowrap">{getTabLabel(tab)}</span>
                  
                  {isActive && (
                    <motion.div
                      className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gradient-to-r from-transparent via-[#8B5CF6] to-transparent rounded-full"
                      layoutId="activeTabIndicator"
                      transition={{ duration: 0.3, type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
                
                {index < visibleTabs.length - 1 && (
                  <div className={cn(
                    "mx-2 w-8 h-px transition-colors duration-300",
                    index < activeIndex 
                      ? "bg-gradient-to-r from-[rgba(139,92,246,0.5)] to-[rgba(139,92,246,0.3)]" 
                      : "bg-white/[0.08]"
                  )} />
                )}
              </motion.div>
            );
          })}

          {/* Generation Models Settings Button */}
          <div className="ml-4 pl-4 border-l border-white/[0.06]">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2.5 rounded-full text-sm font-medium transition-all duration-300",
                    "backdrop-blur-md border",
                    "bg-white/[0.03] text-muted-foreground border-[rgba(249,115,22,0.15)]",
                    "hover:text-foreground hover:bg-[rgba(249,115,22,0.06)] hover:border-[rgba(249,115,22,0.3)]",
                    "hover:shadow-[0_0_20px_rgba(249,115,22,0.1)]"
                  )}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">Models</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={12}
                className={cn(
                  "w-[calc(100vw-2rem)] sm:w-[420px] p-0 rounded-xl",
                  "bg-[#0f0f13] border-[rgba(249,115,22,0.15)]",
                  "shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(249,115,22,0.08)]"
                )}
              >
                <div className="p-5 border-b border-[rgba(249,115,22,0.1)]">
                  <h3 className="text-sm font-semibold text-white tracking-wide">Generation Models</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Configure project defaults for storyline and media generation.
                  </p>
                </div>

                <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto">
                  {/* Storyline model */}
                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                      Storyline model
                    </span>
                    <select
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-sm text-zinc-200",
                        "bg-[rgba(255,255,255,0.03)] border border-[rgba(249,115,22,0.15)]",
                        "focus:border-[rgba(249,115,22,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(249,115,22,0.2)]",
                        "transition-all duration-200"
                      )}
                      value={projectData.storylineTextModel || 'gmi/gemini-3.1-flash-lite'}
                      onChange={(e) => updateProjectData({ storylineTextModel: e.target.value })}
                    >
                      {storylineModelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                          {formatStorylineModelLabel(model)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Image model */}
                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                      Default image model
                    </span>
                    <select
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-sm text-zinc-200",
                        "bg-[rgba(255,255,255,0.03)] border border-[rgba(249,115,22,0.15)]",
                        "focus:border-[rgba(249,115,22,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(249,115,22,0.2)]",
                        "transition-all duration-200"
                      )}
                      value={projectData.baseImageModel || imageGenerationModels[0]?.id || 'gmi/seedream-5.0'}
                      onChange={(e) => updateProjectData({ baseImageModel: e.target.value })}
                    >
                      {imageGenerationModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {formatModelLabel(model)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Video model */}
                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                      Default video model
                    </span>
                    <select
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-sm text-zinc-200",
                        "bg-[rgba(255,255,255,0.03)] border border-[rgba(249,115,22,0.15)]",
                        "focus:border-[rgba(249,115,22,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(249,115,22,0.2)]",
                        "transition-all duration-200"
                      )}
                      value={projectData.baseVideoModel || videoGenerationModels[0]?.id || 'gmi/ltx-fast-i2v'}
                      onChange={(e) => updateProjectData({ baseVideoModel: e.target.value })}
                    >
                      {videoGenerationModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {formatModelLabel(model)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Audio model */}
                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                      Default audio model
                    </span>
                    <select
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-sm text-zinc-200",
                        "bg-[rgba(255,255,255,0.03)] border border-[rgba(249,115,22,0.15)]",
                        "focus:border-[rgba(249,115,22,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(249,115,22,0.2)]",
                        "transition-all duration-200"
                      )}
                      value={projectData.baseAudioModel || audioGenerationModels[0]?.id || 'fal-ai/elevenlabs/tts/turbo-v2.5'}
                      onChange={(e) => updateProjectData({ baseAudioModel: e.target.value })}
                    >
                      {audioGenerationModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {formatModelLabel(model)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* JSON override */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                      Storyline JSON override
                    </span>
                    <Textarea
                      value={storylineSettingsText}
                      onChange={(e) => setStorylineSettingsText(e.target.value)}
                      onBlur={handleStorylineSettingsBlur}
                      placeholder='{"temperature":0.7,"maxTokens":2048}'
                      className={cn(
                        'min-h-[80px] text-xs font-mono text-zinc-300 rounded-lg',
                        'bg-[rgba(255,255,255,0.03)] border-[rgba(249,115,22,0.15)]',
                        'focus:border-[rgba(249,115,22,0.4)] focus-visible:ring-[rgba(249,115,22,0.2)]',
                        storylineSettingsError ? 'border-red-500/70' : ''
                      )}
                    />
                    {storylineSettingsError && (
                      <p className="text-xs text-red-400">{storylineSettingsError}</p>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabNavigation;
