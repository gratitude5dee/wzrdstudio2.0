import React, { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { editorTheme, typography, exactMeasurements } from '@/lib/editor/theme';
import { EditorTab } from './EditorIconBar';
import { AssetDropZone } from './AssetDropZone';
import { ProjectAssetsTab } from './tabs/ProjectAssetsTab';
import { VideoLibraryTab } from './tabs/VideoLibraryTab';
import { MusicLibraryTab } from './tabs/MusicLibraryTab';
import { TextOverlayTab } from './tabs/TextOverlayTab';
import { TransitionsTab } from './tabs/TransitionsTab';
import { EffectsTab } from './tabs/EffectsTab';
import { ElementsTab } from './tabs/ElementsTab';
import { toast } from 'sonner';
import { musicPolishAssets, musicStyleRange } from '@/lib/musicPolishAssets';

interface EditorMediaPanelProps {
  activeTab: EditorTab;
  onAssetDrag?: (asset: unknown) => void;
  onAddToTimeline?: (item: unknown) => void;
  onApplyTransition?: (transition: unknown) => void;
  onApplyEffect?: (effect: unknown) => void;
  projectId?: string;
}

const getPayloadLabel = (item: unknown) => {
  if (!item || typeof item !== 'object') return 'item';
  const record = item as { name?: unknown; type?: unknown };
  return typeof record.name === 'string' ? record.name : typeof record.type === 'string' ? record.type : 'item';
};

const sampleImages = [
  ...musicStyleRange,
  musicPolishAssets.cinema.neonStreet,
  musicPolishAssets.cinema.soundstage,
  musicPolishAssets.toolSurfaces.lipsyncProductRead,
  musicPolishAssets.landing.platformDeliveryWall,
] as const;

export const EditorMediaPanel: React.FC<EditorMediaPanelProps> = ({
  activeTab,
  onAssetDrag,
  onAddToTimeline,
  onApplyTransition,
  onApplyEffect,
  projectId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Handler for adding items to timeline
  const handleAddToTimeline = useCallback((item: unknown) => {
    if (onAddToTimeline) {
      onAddToTimeline(item);
    } else {
      toast.success(`Added ${getPayloadLabel(item)} to timeline`);
    }
  }, [onAddToTimeline]);

  // Handler for applying transitions
  const handleApplyTransition = useCallback((transition: unknown) => {
    if (onApplyTransition) {
      onApplyTransition(transition);
    } else {
      toast.success(`Applied ${getPayloadLabel(transition)} transition`);
    }
  }, [onApplyTransition]);

  // Handler for applying effects
  const handleApplyEffect = useCallback((effect: unknown) => {
    if (onApplyEffect) {
      onApplyEffect(effect);
    } else {
      toast.success(`Applied ${getPayloadLabel(effect)} effect`);
    }
  }, [onApplyEffect]);

  const getTabTitle = (tab: EditorTab): string => {
    const titles: Record<EditorTab, string> = {
      assets: 'Project Assets',
      upload: 'Upload',
      photos: 'Photos',
      videos: 'Videos',
      elements: 'Elements',
      text: 'Text',
      music: 'Music',
      transitions: 'Transitions',
      effects: 'Effects',
    };
    return titles[tab];
  };

  return (
    <div
      className="flex flex-col border-r overflow-hidden backdrop-blur-xl relative z-10"
      style={{
        width: `${exactMeasurements.mediaPanel.width}px`,
        background: 'rgba(15, 15, 20, 0.8)',
        borderColor: editorTheme.border.subtle,
      }}
    >
      {/* Header */}
      <div
        className="border-b"
        style={{
          padding: `${exactMeasurements.mediaPanel.padding}px`,
          borderColor: editorTheme.border.subtle,
        }}
      >
        <h2
          style={{
            color: editorTheme.text.primary,
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            marginBottom: '12px',
          }}
        >
          {getTabTitle(activeTab)}
        </h2>

        {/* Search Input - Photos tab only */}
        {activeTab === 'photos' && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search WZRD stills..."
              className="w-full pr-10 focus:outline-none focus:ring-2 transition-all"
              style={{
                height: `${exactMeasurements.mediaPanel.searchHeight}px`,
                background: editorTheme.bg.tertiary,
                border: `1px solid ${editorTheme.border.subtle}`,
                borderRadius: `${exactMeasurements.mediaPanel.imageBorderRadius}px`,
                color: editorTheme.text.primary,
                fontSize: typography.fontSize.sm,
                padding: '0 12px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = editorTheme.border.focus;
                e.currentTarget.style.boxShadow = `0 0 0 3px ${editorTheme.border.focus}33`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = editorTheme.border.subtle;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              size={16}
              style={{ color: editorTheme.text.tertiary }}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: activeTab === 'assets' ? '0px' : `${exactMeasurements.mediaPanel.padding}px`,
        }}
      >
        {activeTab === 'assets' && (
          <ProjectAssetsTab projectId={projectId} />
        )}

        {activeTab === 'photos' && (
          <div
            className="grid grid-cols-2"
            style={{
              gap: `${exactMeasurements.mediaPanel.gridGap}px`,
            }}
          >
            {sampleImages.map((asset) => (
              <div
                key={asset.title}
                className="relative cursor-grab active:cursor-grabbing transition-transform duration-200"
                style={{
                  aspectRatio: exactMeasurements.mediaPanel.imageAspectRatio,
                  borderRadius: `${exactMeasurements.mediaPanel.imageBorderRadius}px`,
                  overflow: 'hidden',
                  background: editorTheme.bg.tertiary,
                }}
                draggable
                onDragStart={() => onAssetDrag?.({ src: asset.src, type: 'image', name: asset.title })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <img
                  src={asset.src}
                  alt={asset.alt}
                  className="w-full h-full object-cover"
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'upload' && <AssetDropZone />}

        {activeTab === 'videos' && (
          <VideoLibraryTab
            projectId={projectId}
            onSelectVideo={(video) => {
              handleAddToTimeline({
                type: 'video',
                url: video.url,
                duration: video.duration,
                name: video.name,
              });
            }}
          />
        )}

        {activeTab === 'elements' && (
          <ElementsTab
            onSelectElement={(element) => {
              handleAddToTimeline({
                type: 'element',
                elementType: element.type,
                ...element,
              });
            }}
          />
        )}

        {activeTab === 'text' && (
          <TextOverlayTab
            onAddText={(textConfig) => {
              handleAddToTimeline({
                type: 'text',
                text: textConfig.text,
                style: textConfig.style,
                position: textConfig.position,
                duration: 5000,
              });
            }}
          />
        )}

        {activeTab === 'music' && (
          <MusicLibraryTab
            onSelectTrack={(track) => {
              handleAddToTimeline({
                type: 'audio',
                url: track.url,
                duration: track.duration,
                name: track.name,
              });
            }}
          />
        )}

        {activeTab === 'transitions' && (
          <TransitionsTab
            onSelectTransition={(transition) => {
              handleApplyTransition(transition);
            }}
          />
        )}

        {activeTab === 'effects' && (
          <EffectsTab
            onSelectEffect={(effect) => {
              handleApplyEffect(effect);
            }}
          />
        )}
      </div>
    </div>
  );
};
