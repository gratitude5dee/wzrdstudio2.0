import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useVideoEditorStore, ClipTransition } from '@/store/videoEditorStore';
import { useComputeFlowSync } from '@/hooks/useComputeFlowSync';
import { useRealtimeTimelineSync } from '@/hooks/useRealtimeTimelineSync';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useEditorKeyboardShortcuts } from '@/hooks/editor/useEditorKeyboardShortcuts';
import { usePropertySync } from '@/hooks/editor/usePropertySync';
import { EditorHeader } from './EditorHeader';
import { EditorIconBar, EditorTab } from './EditorIconBar';
import { EditorMediaPanel } from './EditorMediaPanel';
import { EditframeWorkbenchCanvas } from './EditframeWorkbenchCanvas';
import PropertiesPanel from './properties/PropertiesPanel';
import { editorTheme } from '@/lib/editor/theme';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function VideoEditorMain() {
  const { projectId } = useParams();
  const loadProject = useVideoEditorStore((state) => state.loadProject);
  const storeProjectId = useVideoEditorStore((state) => state.project.id);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const selectedAudioTrackIds = useVideoEditorStore((state) => state.selectedAudioTrackIds);
  const projectName = useVideoEditorStore((state) => state.project.name);
  const clips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const composition = useVideoEditorStore((state) => state.composition);
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const undo = useVideoEditorStore((state) => state.undo);
  const redo = useVideoEditorStore((state) => state.redo);

  const [activeMediaTab, setActiveMediaTab] = useState<EditorTab>('assets');
  const [isExporting, setIsExporting] = useState(false);

  // Handler for applying transitions to selected clips
  const handleApplyTransition = useCallback(
    (transition: { type: string; duration: number; direction?: string }) => {
      if (selectedClipIds.length === 0) {
        toast.info('Select a clip to apply a transition');
        return;
      }
      const clipTransition: ClipTransition = {
        type: transition.type as ClipTransition['type'],
        duration: transition.duration,
        direction: transition.direction as ClipTransition['direction'],
      };
      selectedClipIds.forEach((id) => {
        updateClip(id, { transition: clipTransition });
      });
      toast.success(`Applied ${transition.type} transition`);
    },
    [selectedClipIds, updateClip]
  );

  useEffect(() => {
    if (projectId && projectId !== storeProjectId) {
      loadProject(projectId);
    }
  }, [loadProject, projectId, storeProjectId]);

  useComputeFlowSync(projectId ?? storeProjectId);
  useRealtimeTimelineSync(projectId ?? storeProjectId);
  useEditorShortcuts();
  useEditorKeyboardShortcuts();
  usePropertySync();

  const handleTitleChange = (title: string) => {
    // Project name update logic here
    console.log('Update title:', title);
  };

  const handleExport = useCallback(async () => {
    const activeProjectId = projectId ?? storeProjectId;
    if (!activeProjectId) {
      toast.error('Open a project before exporting');
      return;
    }

    const visualAssets = [...clips]
      .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
      .filter((clip) => Boolean(clip.url))
      .map((clip, index) => ({
        id: clip.id,
        type: clip.type,
        subtype: 'visual',
        url: clip.url,
        duration_ms: clip.duration,
        order_index: index,
        metadata: {
          name: clip.name,
          start_ms: clip.startTime ?? 0,
          duration_ms: clip.duration,
          trimStartMs: clip.trimStart,
          trimEndMs: clip.trimEnd,
          transforms: clip.transforms,
          layer: clip.layer,
          source: 'editor_timeline',
        },
      }));

    const audioAssets = [...audioTracks]
      .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
      .filter((track) => Boolean(track.url))
      .map((track, index) => ({
        id: track.id,
        type: 'audio',
        subtype: 'music',
        url: track.url,
        duration_ms: track.duration,
        order_index: visualAssets.length + index,
        metadata: {
          name: track.name,
          start_ms: track.startTime ?? 0,
          duration_ms: track.duration,
          volume: track.volume,
          isMuted: track.isMuted,
          source: 'editor_timeline',
        },
      }));

    const exportAssets = [...visualAssets, ...audioAssets];
    if (visualAssets.length === 0) {
      toast.error('Add at least one visual clip before exporting');
      return;
    }

    setIsExporting(true);
    try {
      toast.info('Submitting Editframe render...');
      const { data, error } = await supabase.functions.invoke('create-final-asset', {
        body: {
          projectId: activeProjectId,
          assets: exportAssets,
          settings: {
            provider: 'editframe',
            includeAudio: true,
            resolution: `${composition.width}x${composition.height}`,
            fps: composition.fps,
          },
        },
      });

      if (error) throw error;
      if (data?.outputUrl) {
        toast.success('Editor export complete');
      } else {
        toast.success('Editor export submitted');
      }
    } catch (error) {
      console.error('Editor export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Editor export failed');
    } finally {
      setIsExporting(false);
    }
  }, [audioTracks, clips, composition.fps, composition.height, composition.width, projectId, storeProjectId]);

  const handleShare = () => {
    console.log('Share clicked');
  };

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{ background: editorTheme.bg.primary }}
    >
      {/* Ambient Glow Effects */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[radial-gradient(ellipse,rgba(255,107,74,0.08)_0%,transparent_70%)] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[radial-gradient(ellipse,rgba(234,88,12,0.06)_0%,transparent_70%)] pointer-events-none z-0" />
      {/* Header */}
      <EditorHeader
        projectTitle={projectName || 'Untitled video'}
        onTitleChange={handleTitleChange}
        canUndo={false}
        canRedo={false}
        onUndo={undo}
        onRedo={redo}
        onShare={handleShare}
        onExport={isExporting ? () => undefined : handleExport}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="flex">
          <EditorIconBar
            activeTab={activeMediaTab}
            onTabChange={setActiveMediaTab}
          />
          <EditorMediaPanel
            activeTab={activeMediaTab}
            onApplyTransition={handleApplyTransition}
            projectId={projectId ?? storeProjectId ?? undefined}
          />
        </div>

        {/* Center - Canvas + Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          <EditframeWorkbenchCanvas
            clips={clips}
            audioTracks={audioTracks}
            composition={composition}
          />
        </div>

        {/* Right Sidebar - Properties */}
        <PropertiesPanel
          selectedClipIds={selectedClipIds}
          selectedAudioTrackIds={selectedAudioTrackIds}
        />
      </div>
    </div>
  );
}
