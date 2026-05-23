import React, { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { SidebarData } from '@/types/storyboardTypes';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LocationSection } from '@/components/timeline/sections/LocationSection';
import { ClothingSection } from '@/components/timeline/sections/ClothingSection';
import { ObjectSubjectSection } from '@/components/timeline/sections/ObjectSubjectSection';
import { SoundSection } from '@/components/timeline/sections/SoundSection';
import { WorldviewSidebarSection } from '@/components/timeline/sections/WorldviewSidebarSection';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, FileCode } from 'lucide-react';

interface EnhancedStoryboardSidebarProps {
  data: SidebarData;
  sceneId: string;
  onUpdate: (updates: {
    description?: string | null;
    location?: string | null;
    lighting?: string | null;
    weather?: string | null;
  }) => void;
  onProjectUpdate?: (updates: { title?: string; description?: string }) => void;
}

const EnhancedStoryboardSidebar: React.FC<EnhancedStoryboardSidebarProps> = ({
  data,
  sceneId,
  onUpdate,
  onProjectUpdate
}) => {
  const [sceneDesc, setSceneDesc] = useState(data.sceneDescription || '');
  const [projectTitle, setProjectTitle] = useState(data.projectTitle || '');
  const [projectDesc, setProjectDesc] = useState(data.projectDescription || '');
  const [openSections, setOpenSections] = useState({
    location: true,
    style: false,
    clothing: false,
    objects: false,
    sound: false,
    worldview: false
  });

  useEffect(() => {
    setSceneDesc(data.sceneDescription || '');
  }, [data.sceneDescription]);

  useEffect(() => {
    setProjectTitle(data.projectTitle || '');
    setProjectDesc(data.projectDescription || '');
  }, [data.projectTitle, data.projectDescription]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleUpdate = (field: keyof Parameters<typeof onUpdate>[0], value: string | null) => {
    onUpdate({ [field]: value });
  };

  const labelBaseClass = "text-[10px] font-medium uppercase text-zinc-400 mb-1 block";
  const inputBaseClass = cn(
    "rounded-lg text-xs h-8 px-3",
    "bg-[#131313] backdrop-blur-sm",
    "border border-[#f97316]/15",
    "focus:border-[#f97316]/40 focus:ring-2 focus:ring-[#f97316]/10",
    "shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
    "transition-all duration-200",
    "placeholder:text-zinc-600"
  );

  return (
    <div className={cn(
      "w-full h-full relative overflow-hidden",
      "bg-[#0f0f0f]/95",
      "backdrop-blur-xl border-r border-[#f97316]/10",
      "shadow-[inset_0_1px_0_rgba(249,115,22,0.03)]"
    )}>
      <ScrollArea className="h-full text-white">
        <div className="p-5 space-y-5">
          {/* Project Title and Description */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <div className={cn(
              "rounded-xl p-4 mb-6",
              "bg-[#121212]",
              "backdrop-blur-sm border border-[#f97316]/20",
              "shadow-[0_0_12px_rgba(249,115,22,0.08),0_8px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(249,115,22,0.05)]"
            )}>
              <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-[#f97316]/10 blur-2xl" />

              <Input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                onBlur={() => onProjectUpdate?.({ title: projectTitle })}
                placeholder="Project Title"
                className="relative z-10 mb-2 font-serif text-lg font-bold tracking-wide text-[#d4a574] bg-transparent border-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#d4a574]/40"
              />
              <Textarea
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                onBlur={() => onProjectUpdate?.({ description: projectDesc })}
                placeholder="Add a project description..."
                className="text-zinc-400 text-xs leading-relaxed relative z-10 bg-transparent border-none p-0 min-h-[40px] resize-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-zinc-600"
              />
            </div>
          </motion.div>

          {/* Scene Description */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <label htmlFor="scene-desc" className={labelBaseClass}>Scene Description</label>
            <Textarea
              id="scene-desc"
              value={sceneDesc}
              onChange={(e) => setSceneDesc(e.target.value)}
              onBlur={() => handleUpdate('description', sceneDesc)}
              placeholder="Describe the scene..."
              className={cn(inputBaseClass, "min-h-[80px]")}
            />
          </motion.div>

          {/* Enhanced Location Section */}
          <LocationSection
            sceneId={sceneId}
            initialData={{
              name: data.sceneLocation || '',
              timeOfDay: '',
              weather: '',
              atmosphere: '',
              specificElements: [],
              cameraEnvironment: ''
            }}
            onUpdate={(locationData) => {
              handleUpdate('location', locationData.name);
            }}
            isOpen={openSections.location}
            onToggle={() => toggleSection('location')}
          />

          {/* Style Section */}
          <Collapsible
            open={openSections.style}
            onOpenChange={() => toggleSection('style')}
            className="space-y-2"
          >
            <CollapsibleTrigger asChild>
              <motion.div
                className={cn(
                  "flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg",
                  "hover:bg-zinc-800/30 transition-all duration-200",
                  "border border-transparent hover:border-[#f97316]/20"
                )}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-zinc-800/50 flex items-center justify-center
                    shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <FileCode className="w-3.5 h-3.5 text-[#d4a574]" />
                  </div>
                  <span className="text-sm font-medium text-zinc-200">Style</span>
                </div>
                <motion.div
                  animate={{ rotate: openSections.style ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                </motion.div>
              </motion.div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pl-5">
                <label className={labelBaseClass}>Video Style</label>
                <p className="text-xs text-zinc-300 capitalize">{data.videoStyle || 'Not Set'}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Clothing Section */}
          <ClothingSection
            sceneId={sceneId}
            characters={data.characters || []}
            isOpen={openSections.clothing}
            onToggle={() => toggleSection('clothing')}
          />

          {/* Objects/Subjects Section */}
          <ObjectSubjectSection
            sceneId={sceneId}
          />

          {/* Sound Section */}
          <SoundSection
            sceneId={sceneId}
            isOpen={openSections.sound}
            onToggle={() => toggleSection('sound')}
          />

          {/* Worldview Section */}
          <WorldviewSidebarSection
            sceneId={sceneId}
            isOpen={openSections.worldview}
            onToggle={() => toggleSection('worldview')}
          />
        </div>
      </ScrollArea>
    </div>
  );
};

export default EnhancedStoryboardSidebar;
