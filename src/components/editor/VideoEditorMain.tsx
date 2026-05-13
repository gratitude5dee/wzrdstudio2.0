import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useVideoEditorStore, Clip, ClipEffect, ClipTransition, AudioTrack } from '@/store/videoEditorStore';
import { useComputeFlowSync } from '@/hooks/useComputeFlowSync';
import { useRealtimeTimelineSync } from '@/hooks/useRealtimeTimelineSync';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { usePropertySync } from '@/hooks/editor/usePropertySync';
import { EditorHeader } from './EditorHeader';
import { EditorIconBar, EditorTab } from './EditorIconBar';
import { EditorMediaPanel } from './EditorMediaPanel';
import { WasmWorkbenchCanvas } from './WasmWorkbenchCanvas';
import PropertiesPanel from './properties/PropertiesPanel';
import { editorTheme } from '@/lib/editor/theme';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { renderTimelineWasm, finalizeLocalRender } from '@/lib/render/wasmRenderer';

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
  const history = useVideoEditorStore((state) => state.history);
  const addClip = useVideoEditorStore((state) => state.addClip);
  const addAudioTrack = useVideoEditorStore((state) => state.addAudioTrack);
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const selectClip = useVideoEditorStore((state) => state.selectClip);
  const selectAudioTrack = useVideoEditorStore((state) => state.selectAudioTrack);
  const undo = useVideoEditorStore((state) => state.undo);
  const redo = useVideoEditorStore((state) => state.redo);

  const [activeMediaTab, setActiveMediaTab] = useState<EditorTab>('assets');
  const [isExporting, setIsExporting] = useState(false);
  const [exportState, setExportState] = useState<{
    status: 'idle' | 'setup_error' | 'processing' | 'completed' | 'failed';
    jobId?: string;
    providerJobId?: string;
    outputUrl?: string;
    message?: string;
    setupErrors?: string[];
  }>({ status: 'idle' });

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

  const handleApplyEffect = useCallback(
    (effect: ClipEffect) => {
      if (selectedClipIds.length === 0) {
        toast.info('Select a clip to apply an effect');
        return;
      }
      selectedClipIds.forEach((id) => {
        const clip = clips.find((item) => item.id === id);
        if (!clip) return;
        const nextEffects = [...(clip.effects ?? []).filter((item) => item.id !== effect.id), effect];
        updateClip(id, { effects: nextEffects });
      });
      toast.success(`Applied ${effect.name}`);
    },
    [clips, selectedClipIds, updateClip]
  );

  const handleAddToTimeline = useCallback(
    (item: any) => {
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
          startTime: audioStart,
          duration: durationMs,
          endTime: audioStart + durationMs,
          volume: 1,
          isMuted: false,
          trackIndex: 0,
          fadeInDuration: 0,
          fadeOutDuration: 0,
        };
        addAudioTrack(track);
        selectAudioTrack(track.id);
        return;
      }

      const clip: Clip = {
        id: uuidv4(),
        type: item.type === 'text' ? 'text' : item.type === 'element' ? 'element' : item.type === 'image' ? 'image' : 'video',
        name: item.name ?? (item.text ? item.text.slice(0, 32) : 'Timeline clip'),
        url: item.url ?? '',
        text: item.text,
        style: item.style,
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
      loadProject(projectId);
    }
  }, [loadProject, projectId, storeProjectId]);

  useComputeFlowSync(projectId ?? storeProjectId);
  useRealtimeTimelineSync(projectId ?? storeProjectId);
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
      .filter((clip) => Boolean(clip.url) || clip.type === 'text' || clip.type === 'element')
      .map((clip, index) => ({
        id: clip.id,
        type: clip.type,
        subtype: clip.type === 'text' ? 'text' : clip.type === 'element' ? 'element' : 'visual',
        url: clip.url || undefined,
        duration_ms: clip.duration,
        order_index: index,
        metadata: {
          name: clip.name,
          text: clip.text,
          start_ms: clip.startTime ?? 0,
          duration_ms: clip.duration,
          trimStartMs: clip.trimStart,
          trimEndMs: clip.trimEnd,
          transforms: clip.transforms,
          layer: clip.layer,
          trackIndex: clip.trackIndex,
          transition: clip.transition,
          effects: clip.effects,
          style: clip.style,
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
      setExportState({ status: 'processing', message: 'Submitting FAL render…' });
      toast.info('Submitting FAL render…');
      const { data, error } = await supabase.functions.invoke('create-final-asset', {
        body: {
          projectId: activeProjectId,
          assets: exportAssets,
          settings: {
            provider: 'fal',
            renderMode: 'sync',
            includeAudio: true,
            resolution: `${composition.width}x${composition.height}`,
            fps: composition.fps,
          },
        },
      });

      if (error) throw error;
      const jobId = data?.jobId;
      const tryWasmFallback = async (reason: string) => {
        toast.info('Falling back to in-browser WASM renderer…');
        setExportState({ status: 'processing', jobId, message: `WASM fallback: ${reason}` });
        const visualClipsForWasm = clips
          .slice()
          .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
          .filter((c) => Boolean(c.url) && (c.type === 'video' || c.type === 'image'))
          .map((c) => ({
            url: c.url as string,
            durationMs: c.duration ?? 3000,
            kind: (c.type === 'image' ? 'image' : 'video') as 'image' | 'video',
          }));
        const firstAudio = audioTracks.find((t) => Boolean(t.url));
        const result = await renderTimelineWasm({
          projectId: activeProjectId,
          visuals: visualClipsForWasm,
          audio: firstAudio ? { url: firstAudio.url } : null,
          width: composition.width,
          height: composition.height,
          fps: composition.fps,
          onProgress: (pct, message) =>
            setExportState((prev) => ({ ...prev, status: 'processing', jobId, message: `${message ?? 'Rendering'} (${pct}%)` })),
        });
        if (jobId) await finalizeLocalRender(jobId, activeProjectId, result.publicUrl);
        setExportState({ status: 'completed', jobId, outputUrl: result.publicUrl, message: 'WASM export complete' });
        toast.success('Local WASM export complete');
      };

      if (data?.status === 'failed') {
        try {
          await tryWasmFallback(data.error ?? 'FAL render failed');
        } catch (wasmErr) {
          setExportState({
            status: 'failed',
            jobId,
            message: `${data.error ?? 'FAL render failed'} · WASM fallback: ${wasmErr instanceof Error ? wasmErr.message : 'failed'}`,
          });
          toast.error('Both FAL and WASM renderers failed');
        }
        return;
      }
      setExportState({
        status: data?.status === 'completed' ? 'completed' : 'processing',
        jobId,
        outputUrl: data?.outputUrl,
        message: data?.status === 'completed' ? 'Export complete' : 'Rendering with FAL ffmpeg',
      });
      if (data?.status === 'completed') toast.success('Editor export complete');
    } catch (error) {
      console.error('Editor export failed:', error);
      setExportState({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Editor export failed',
      });
      toast.error(error instanceof Error ? error.message : 'Editor export failed');
    } finally {
      setIsExporting(false);
    }
  }, [audioTracks, clips, composition.fps, composition.height, composition.width, projectId, storeProjectId]);

  const handleReconcileExport = useCallback(async () => {
    const activeProjectId = projectId ?? storeProjectId;
    if (!activeProjectId || !exportState.jobId) return;
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-final-asset', {
        body: { action: 'reconcile', projectId: activeProjectId, jobId: exportState.jobId },
      });
      if (error) throw error;
      if (data?.outputUrl) {
        setExportState({ status: 'completed', jobId: exportState.jobId, outputUrl: data.outputUrl, message: 'Export complete' });
        toast.success('Editframe render reconciled');
      } else {
        setExportState((current) => ({ ...current, message: data?.error ?? 'Render is not complete yet' }));
        toast.info('Render is not complete yet');
      }
    } catch (error) {
      setExportState((current) => ({
        ...current,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Reconcile failed',
      }));
      toast.error(error instanceof Error ? error.message : 'Reconcile failed');
    } finally {
      setIsExporting(false);
    }
  }, [exportState.jobId, projectId, storeProjectId]);

  useEditorShortcuts({ onExport: isExporting ? undefined : handleExport });

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
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onShare={handleShare}
        onExport={isExporting ? () => undefined : handleExport}
      />

      {exportState.status !== 'idle' && (
        <div className="border-b border-white/10 bg-black/70 px-4 py-2 text-sm text-zinc-200">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-medium">
                {exportState.status === 'setup_error'
                  ? 'FAL setup required'
                  : exportState.status === 'completed'
                    ? 'Export complete'
                    : exportState.status === 'failed'
                      ? 'Export failed'
                      : 'FAL render processing'}
              </span>
              {exportState.message && <span className="ml-2 text-zinc-400">{exportState.message}</span>}
              {exportState.outputUrl && (
                <a className="ml-3 text-orange-300 underline" href={exportState.outputUrl} target="_blank" rel="noreferrer">
                  Open MP4
                </a>
              )}
            </div>
            {exportState.jobId && exportState.status !== 'completed' && (
              <button
                type="button"
                onClick={handleReconcileExport}
                className="rounded border border-white/10 px-3 py-1 text-xs text-zinc-100 hover:bg-white/10"
                disabled={isExporting}
              >
                Reconcile
              </button>
            )}
          </div>
        </div>
      )}

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
          <WasmWorkbenchCanvas
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
