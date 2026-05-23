import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import ModelSelector, { Model } from './ModelSelector';
import { useCatalogModels } from '@/hooks/useCatalogModels';

interface StudioSidePanelsProps {
  selectedBlockType: 'text' | 'image' | 'video' | null;
}

const toSelectorModels = (models: ReturnType<typeof useCatalogModels>['models']): Model[] => models.map(m => ({
  id: m.id,
  name: m.name,
  credits: m.credits,
  time: m.time,
  description: m.description,
  category: m.category,
  provider: m.provider,
  media_type: m.media_type,
  workflow_type: m.workflow_type,
  ui_group: m.ui_group,
}));

export const StudioRightPanel = ({ selectedBlockType }: StudioSidePanelsProps) => {
  const { models: catalogModels } = useCatalogModels({ autoFetch: true });
  const selectorModels = toSelectorModels(catalogModels);
  // Model selector state - using full model IDs
  const [textModelId, setTextModelId] = useState('gmi/deepseek-r1');
  const [imageModelId, setImageModelId] = useState('gmi/seedream-5.0-lite');
  const [videoModelId, setVideoModelId] = useState('gmi/kling-v3-omni');
  
  // Model dropdown states
  const [showTextModelDropdown, setShowTextModelDropdown] = useState(false);
  const [showImageModelDropdown, setShowImageModelDropdown] = useState(false);
  const [showVideoModelDropdown, setShowVideoModelDropdown] = useState(false);
  
  // Image settings state
  const [quality, setQuality] = useState(100);
  const [seed, setSeed] = useState('339071969');
  const [size, setSize] = useState('1:1');
  
  // If no block is selected, return empty panel
  if (!selectedBlockType) {
    return <div className="w-64 h-full bg-black border-l border-zinc-800/50"></div>;
  }
  
  // Get models based on selected block type
  const getModels = () => {
    switch (selectedBlockType) {
      case 'text':
        return selectorModels.filter((model) => model.media_type === 'text');
      case 'image':
        return selectorModels.filter((model) => model.media_type === 'image');
      case 'video':
        return selectorModels.filter((model) => model.media_type === 'video');
      default:
        return [];
    }
  };
  
  // Get selected model id based on block type
  const getSelectedModelId = () => {
    switch (selectedBlockType) {
      case 'text':
        return textModelId;
      case 'image':
        return imageModelId;
      case 'video':
        return videoModelId;
      default:
        return '';
    }
  };
  
  // Handle model selection based on block type
  const handleModelSelect = (modelId: string) => {
    switch (selectedBlockType) {
      case 'text':
        setTextModelId(modelId);
        break;
      case 'image':
        setImageModelId(modelId);
        break;
      case 'video':
        setVideoModelId(modelId);
        break;
    }
  };
  
  // Toggle model dropdown based on block type
  const toggleModelDropdown = () => {
    switch (selectedBlockType) {
      case 'text':
        setShowTextModelDropdown(!showTextModelDropdown);
        break;
      case 'image':
        setShowImageModelDropdown(!showImageModelDropdown);
        break;
      case 'video':
        setShowVideoModelDropdown(!showVideoModelDropdown);
        break;
    }
  };
  
  // Get dropdown state based on block type
  const getDropdownState = () => {
    switch (selectedBlockType) {
      case 'text':
        return showTextModelDropdown;
      case 'image':
        return showImageModelDropdown;
      case 'video':
        return showVideoModelDropdown;
      default:
        return false;
    }
  };
  
  return (
    <div className="w-64 h-full bg-zinc-900/75 border-l border-zinc-800/50">
      <div className="p-5 space-y-6">
        <div className="space-y-1">
          <label className="text-xs text-zinc-500 font-medium">MODEL</label>
          <ModelSelector
            models={getModels()}
            selectedModelId={getSelectedModelId()}
            onModelSelect={handleModelSelect}
            modelType={selectedBlockType}
            isOpen={getDropdownState()}
            toggleOpen={toggleModelDropdown}
          />
        </div>
        
        {(selectedBlockType === 'image' || selectedBlockType === 'video') && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs text-zinc-500 font-medium">QUALITY</label>
                <span className="text-white">{quality}</span>
              </div>
              <Slider 
                value={[quality]}
                min={1} 
                max={100} 
                step={1}
                onValueChange={(value) => setQuality(value[0])}
                className="mt-2"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">SIZE</label>
              <button className="w-full flex items-center justify-between p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-md">
                <span className="text-zinc-300">Square (1:1)</span>
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              </button>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">SEED</label>
              <Input 
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="bg-zinc-800/50 border-zinc-700 text-white"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
