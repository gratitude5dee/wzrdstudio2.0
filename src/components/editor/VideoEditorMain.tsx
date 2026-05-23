import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useVideoEditorStore, Clip, ClipEffect, ClipTransition, AudioTrack } from '@/store/videoEditorStore';
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
import { ExportDialog } from './toolbar/ExportDialog';
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
  const selectClip = useVideoEditorStore((state) => state.selectClip);
  const selectAudioTrack = useVideoEditorStore((state) => state.selectAudioTrack);
  const playback = useVideoEditorStore((state) => state.playback);
  const composition = useVideoEditorStore((state) => state.composition);
  const play = useVideoEditorStore((state) => state.play);
  const pause = useVideoEditorStore((state) => state.pause);
  const seek = useVideoEditorStore((state) => state.seek);
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const undo = useVideoEditorStore((state) => state.undo);
  const redo = useVideoEditorStore((state) => state.redo);
  const canUndo = useVideoEditorStore((state) => state.history.past.length > 0);
  const canRedo = useVideoEditorStore((state) => state.history.future.length > 0);

  const [activeMediaTab, setActiveMediaTab] = useState<EditorTab>('assets');
  const [isExportDialogOpen, setExportDialogOpen] = useState(false);

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

  const handleApplyEffect = useCallback(
    (effect: ClipEffect) => {
      if (selectedClipIds.length === 0) {
        toast.info('Select a clip to apply an effect');
        return;
      }

      selectedClipIds.forEach((id, index) => {
        const clip = clips.find((item) => item.id === id);
        if (!clip) return;

        updateClip(
          id,
          {
            effects: [
              ...(clip.effects ?? []).filter((existing) => existing.id !== effect.id),
              effect,
            ],
          },
          { skipHistory: index > 0 }
        );
      });
      toast.success(`Applied ${effect.name} effect`);
    },
    [clips, selectedClipIds, updateClip]
  );

  const handleAddToTimeline = useCallback(
    (item: Record<string, any>) => {
      const visualStart = clips.reduce(
        (cursor, clip) => Math.max(cursor, clip.endTime ?? (clip.startTime ?? 0) + (clip.duration ?? 0)),
        0
      );
      const audioStart = audioTracks.reduce(
        (cursor, track) => Math.max(cursor, track.endTime ?? (track.startTime ?? 0) + (track.duration ?? 0)),
        0
      );
      const durationMs = Math.max(1000, item.duration > 1000 ? item.duration : (item.duration ?? 5) * 1000);

      if (item.type === 'audio') {
        const track: AudioTrack = {
          id: uuidv4(),
          type: 'audio',
          name: item.name ?? 'Audio',
          url: item.url ?? '',
          thumbnailUrl: item.thumbnailUrl ?? null,
          previewUrl: item.previewUrl ?? null,
          mediaMetadata: item.mediaMetadata,
          startTime: audioStart,
          duration: durationMs,
          endTime: audioStart + durationMs,
          volume: 1,
          isMuted: false,
          trackIndex: audioTracks.length
            ? Math.max(...audioTracks.map((trackItem) => trackItem.trackIndex ?? 0)) + 1
            : 0,
          fadeInDuration: 0,
          fadeOutDuration: 0,
        };
        addAudioTrack(track);
        selectAudioTrack(track.id);
        return;
      }

      const clipType: Clip['type'] =
        item.type === 'text' ? 'text' : item.type === 'element' ? 'element' : item.type === 'image' ? 'image' : 'video';
      const clip: Clip = {
        id: uuidv4(),
        type: clipType,
        name: item.name ?? (item.text ? item.text.slice(0, 32) : 'Timeline clip'),
        url: item.url ?? '',
        text: item.text,
        style: item.style,
        thumbnailUrl: item.thumbnailUrl ?? null,
        previewUrl: item.previewUrl ?? null,
        mediaMetadata: item.mediaMetadata,
        startTime: visualStart,
        duration: durationMs,
        endTime: visualStart + durationMs,
        trackIndex: 0,
        layer: Math.max(0, clips.reduce((max, current) => Math.max(max, current.layer ?? 0), 0)),
        transforms: {
          position: item.position
            ? { x: Number(item.position.x ?? 0), y: Number(item.position.y ?? 0) }
            : { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          opacity: 1,
        },
        effects: item.effects ?? [],
      };
      addClip(clip);
      selectClip(clip.id);
    },
    [addAudioTrack, addClip, audioTracks, clips, selectAudioTrack, selectClip]
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
  usePropertySync();

  const handleTitleChange = (title: string) => {
    console.log('Update title:', title);
  };

  const handleExport = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  useEditorShortcuts({ onExport: handleExport });
  useEditorKeyboardShortcuts();

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
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onShare={handleShare}
        onExport={handleExport}
      />
      <ExportDialog open={isExportDialogOpen} onOpenChange={setExportDialogOpen} />

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
            onAddToTimeline={handleAddToTimeline}
            onApplyTransition={handleApplyTransition}
            onApplyEffect={handleApplyEffect}
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
