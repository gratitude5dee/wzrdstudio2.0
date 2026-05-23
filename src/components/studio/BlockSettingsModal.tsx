import React, { useEffect, useRef } from 'react';
import { Sparkles, Image as ImageIcon, Video, Music } from 'lucide-react';
import { ModelListItem } from './StudioUtils';
import { useCatalogModels, type CatalogModelSummary } from '@/hooks/useCatalogModels';

interface BlockSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockType: 'text' | 'image' | 'video' | 'upload' | null;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

const convertToDisplayModel = (models: CatalogModelSummary[]) => models.map(m => ({
  id: m.id,
  name: m.name,
  description: m.description,
  credits: m.credits ?? 0,
  time: m.time ?? '~10s',
  icon: m.icon ?? m.media_type,
}));

const getModelIcon = (iconType: string) => {
  if (iconType === 'sparkles-blue') return <Sparkles className="h-4 w-4 text-blue-400" />;
  if (iconType === 'sparkles-orange') return <Sparkles className="h-4 w-4 text-orange-400" />;
  if (iconType === 'sparkles' || iconType === 'text') return <Sparkles className="h-4 w-4 text-zinc-400" />;
  if (iconType === 'image') return <ImageIcon className="h-4 w-4 text-purple-400" />;
  if (iconType === 'video') return <Video className="h-4 w-4 text-amber-400" />;
  if (iconType === 'audio') return <Music className="h-4 w-4 text-amber-400" />;
  return <Sparkles className="h-4 w-4 text-zinc-400" />;
};

const BlockSettingsModal: React.FC<BlockSettingsModalProps> = ({
  isOpen,
  onClose,
  blockType,
  selectedModel,
  onModelChange,
}) => {
  const { models: catalogModels } = useCatalogModels({ autoFetch: true });
  const models = convertToDisplayModel(
    catalogModels.filter((model) => {
      if (blockType === 'text') return model.media_type === 'text';
      if (blockType === 'image') return model.media_type === 'image';
      if (blockType === 'video') return model.media_type === 'video';
      return false;
    })
  );
  const currentModel = models.find(m => m.id === selectedModel);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="fixed top-[66px] right-4 w-80 bg-[#1a1a1a] border border-[rgba(249,115,22,0.15)] text-white shadow-[0_0_12px_rgba(249,115,22,0.06)] rounded-lg z-[100]"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Model</h3>
          <div className="flex items-center gap-2">
            {currentModel && getModelIcon(currentModel.icon)}
            <span className="text-sm font-semibold text-white">
              {currentModel?.name || 'Select Model'}
            </span>
          </div>
        </div>

        {/* Model List */}
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {models.map((model) => (
            <ModelListItem
              key={model.id}
              icon={getModelIcon(model.icon)}
              name={model.name}
              description={model.description}
              credits={model.credits}
              time={model.time}
              isSelected={selectedModel === model.id}
              onClick={() => onModelChange(model.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default BlockSettingsModal;
