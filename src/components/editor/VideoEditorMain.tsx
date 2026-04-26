import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useVideoEditorStore, ClipTransition } from '@/store/videoEditorStore';
import { useComputeFlowSync } from '@/hooks/useComputeFlowSync';
import { useRealtimeTimelineSync } from '@/hooks/useRealtimeTimelineSync';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useEditorKeyboardShortcuts } from '@/hooks/editor/useEditorKeyboardShortcuts';
import { usePropertySync } from '@/hooks/editor/usePropertySync';
import { loadDemoContent } from '@/lib/demoContent';
import { EditorHeader } from './EditorHeader';
import { EditorIconBar, EditorTab } from './EditorIconBar';
import { EditorMediaPanel } from './EditorMediaPanel';
import { EditorCanvas } from './EditorCanvas';
import TimelinePanel from './timeline/TimelinePanel';
import PropertiesPanel from './properties/PropertiesPanel';
import { editorTheme } from '@/lib/editor/theme';
import { toast } from 'sonner';

export default function VideoEditorMain() {
  const { projectId } = useParams();
  const loadProject = useVideoEditorStore((state) => state.loadProject);
  const storeProjectId = useVideoEditorStore((state) => state.project.id);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const selectedAudioTrackIds = useVideoEditorStore((state) => state.selectedAudioTrackIds);
  const projectName = useVideoEditorStore((state) => state.project.name);
  const clips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const addClip = useVideoEditorStore((state) => state.addClip);
  const addAudioTrack = useVideoEditorStore((state) => state.addAudioTrack);
  const playback = useVideoEditorStore((state) => state.playback);
  const composition = useVideoEditorStore((state) => state.composition);
  const play = useVideoEditorStore((state) => state.play);
  const pause = useVideoEditorStore((state) => state.pause);
  const seek = useVideoEditorStore((state) => state.seek);
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const undo = useVideoEditorStore((state) => state.undo);
  const redo = useVideoEditorStore((state) => state.redo);

  const [activeMediaTab, setActiveMediaTab] = useState<EditorTab>('assets');

  // Compute effective duration from clips, audio, and composition
  const effectiveDurationSec = useMemo(() => {
    const clipDuration = clips.reduce((max, clip) => {
      const start = clip.startTime ?? 0;
      const end = start + (clip.duration ?? 0);
      return Math.max(max, end);
    }, 0);
    const audioDuration = audioTracks.reduce((max, track) => {
      const start = track.startTime ?? 0;
      const end = start + (track.duration ?? 0);
      return Math.max(max, end);
    }, 0);
    return Math.max(composition.duration, clipDuration, audioDuration, 1000) / 1000;
  }, [clips, audioTracks, composition.duration]);

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
      loadProject(projectId).then(() => {
        if (clips.length === 0) {
          loadDemoContent(addClip, addAudioTrack);
        }
      });
    } else if (clips.length === 0) {
      loadDemoContent(addClip, addAudioTrack);
    }
  }, [loadProject, projectId, storeProjectId, clips.length, addClip, addAudioTrack]);

  useComputeFlowSync(projectId ?? storeProjectId);
  useRealtimeTimelineSync(projectId ?? storeProjectId);
  useEditorShortcuts();
  useEditorKeyboardShortcuts();
  usePropertySync();

  const handleTitleChange = (title: string) => {
    // Project name update logic here
    console.log('Update title:', title);
  };

  const handleExport = () => {
    console.log('Export clicked');
  };

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
        onExport={handleExport}
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
          <EditorCanvas
            currentTime={playback.currentTime / 1000}
            duration={effectiveDurationSec}
            isPlaying={playback.isPlaying}
            onPlay={play}
            onPause={pause}
            onSeek={(time) => seek(time * 1000)}
          />

          <TimelinePanel />
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
