import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, HelpCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

import { KanvasLyricsHeader } from '@/components/kanvas-lyrics/KanvasLyricsHeader';
import { KanvasLyricsFooter } from '@/components/kanvas-lyrics/KanvasLyricsFooter';
import { AudioPanel } from '@/components/kanvas-lyrics/AudioPanel';
import { LyricsPanel } from '@/components/kanvas-lyrics/LyricsPanel';
import { MarkersPanel } from '@/components/kanvas-lyrics/MarkersPanel';
import { VisualizePanel } from '@/components/kanvas-lyrics/VisualizePanel';
import { TemplatesLanding } from '@/components/kanvas-lyrics/TemplatesLanding';
import { INITIAL_AUDIO } from '@/components/kanvas-lyrics/constants';
import type {
  AppState,
  AudioData,
  ClipDuration,
  CutMarker,
  LyricBlock,
  TranscribeStatus,
  WizardStep,
} from '@/components/kanvas-lyrics/types';
import {
  createTemplate,
  finalizeTemplate,
  getTemplate,
  transcribeTemplate,
  updateTemplate,
  uploadTemplateAudio,
} from '@/features/kanvas-lyrics/service';
import type { KanvasLyricTemplate } from '@/features/kanvas-lyrics/types';
import { useAudioEngine } from '@/features/kanvas-lyrics/useAudioEngine';
import { decodeWaveform } from '@/features/kanvas-lyrics/decodeWaveform';
import { sliceAudioToWav } from '@/features/kanvas-lyrics/clipAudio';
import { supabase } from '@/integrations/supabase/client';

type ClipDurationMs = 15000 | 30000 | 45000 | 60000;

function blocksFromServer(t: KanvasLyricTemplate): LyricBlock[] {
  return t.lyricBlocks.map((b, i) => ({
    id: b.id,
    label: `BLOCK ${i + 1}`,
    startTime: b.startTimeMs / 1000,
    endTime: b.endTimeMs / 1000,
    words: b.words.map((w) => ({
      id: w.id,
      text: w.text,
      startTime: w.startTimeMs / 1000,
      endTime: w.endTimeMs / 1000,
    })),
  }));
}

function blocksToServer(blocks: LyricBlock[]) {
  return blocks.map((b) => ({
    id: b.id,
    startTimeMs: Math.round(b.startTime * 1000),
    endTimeMs: Math.round(b.endTime * 1000),
    words: b.words.map((w) => ({
      id: w.id,
      text: w.text,
      startTimeMs: Math.round(w.startTime * 1000),
      endTimeMs: Math.round(w.endTime * 1000),
    })),
  }));
}

function markersToServer(markers: CutMarker[]) {
  return markers.map((m) => ({ id: m.id, timestampMs: Math.round(m.timestamp * 1000) }));
}

function stepFromStatus(t: KanvasLyricTemplate): WizardStep {
  switch (t.status) {
    case 'saved':
      return 4;
    case 'markers_ready':
      return 3;
    case 'lyrics_ready':
    case 'lyrics_processing':
    case 'audio_ready':
      return 2;
    default:
      return 1;
  }
}

const KanvasLyrics = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const templateIdParam = searchParams.get('templateId');
  const showWizard = mode === 'new' || !!templateIdParam;

  const [templateId, setTemplateId] = useState<string | null>(templateIdParam);
  const [hydrating, setHydrating] = useState(!!templateIdParam);
  const [transcribeStatus, setTranscribeStatus] = useState<TranscribeStatus>('idle');
  const [saving, setSaving] = useState(false);

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [appState, setAppState] = useState<AppState>('upload');
  const [audio, setAudio] = useState<AudioData>(INITIAL_AUDIO);
  const [audioAssetId, setAudioAssetId] = useState<string | null>(null);
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricBlock[]>([]);
  const [markers, setMarkers] = useState<CutMarker[]>([]);

  // Local source File kept for the entire wizard so we can slice + upload
  // only the trimmed clip on Confirm. Never written to network until then.
  const sourceFileRef = useRef<File | null>(null);

  const engine = useAudioEngine();

  const lastUrlRef = useRef<string | null>(null);
  useEffect(() => () => { if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current); }, []);

  // Hydrate from server when templateId is in URL.
  useEffect(() => {
    if (!templateIdParam) return;
    let cancelled = false;
    setHydrating(true);
    (async () => {
      try {
        const t = await getTemplate(templateIdParam);
        if (cancelled) return;
        setTemplateId(t.id);
        setAudioAssetId(t.sourceAudioAssetId);
        setAudio({
          fileName: t.title,
          fileUrl: null,
          totalDuration: (t.totalDurationMs ?? t.selectionDurationMs) / 1000,
          selectionStart: t.selectionStartMs / 1000,
          selectionDuration: (t.selectionDurationMs / 1000) as ClipDuration,
          zoom: 1,
          confirmed: t.status !== 'draft',
          peaks: t.waveformPeaks ?? [],
        });
        setLyrics(blocksFromServer(t));
        setMarkers(t.cutMarkers.map((m) => ({ id: m.id, timestamp: m.timestampMs / 1000 })));
        setCurrentStep(stepFromStatus(t));
        setAppState(
          t.status === 'draft'
            ? 'trim'
            : t.status === 'audio_ready'
            ? 'lyrics_edit'
            : t.status === 'lyrics_ready'
            ? 'lyrics_complete'
            : t.status === 'saved'
            ? 'visualize'
            : 'markers_edit'
        );
        if (t.status === 'lyrics_processing') setTranscribeStatus('transcribing');
        else if (t.status === 'failed') setTranscribeStatus('failed');
        else setTranscribeStatus('ready');

        // Resolve a playback URL from the asset
        try {
          const { data: asset } = await supabase
            .from('project_assets')
            .select('url, metadata')
            .eq('id', t.sourceAudioAssetId)
            .maybeSingle();
          if (!cancelled && asset?.url) setAudioPlaybackUrl(asset.url as string);
        } catch (e) {
          console.warn('[lyrics] could not resolve audio url', e);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load template');
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateIdParam]);

  // Wire the audio engine: load url + set loop bounds.
  // Depend on the stable callbacks (not the engine object, which is a new
  // reference on every render and would re-trigger load() in a loop, keeping
  // isReady stuck at false and disabling "Confirm Selection").
  const engineLoad = engine.load;
  const engineSetLoop = engine.setLoop;
  useEffect(() => {
    if (audioPlaybackUrl) engineLoad(audioPlaybackUrl);
  }, [audioPlaybackUrl, engineLoad]);

  useEffect(() => {
    // Loop on the audio/lyrics/markers steps so the user can review the
    // selection continuously; play once on the visualize step (step 4)
    // so "Replay" feels intentional.
    engineSetLoop(
      audio.selectionStart,
      audio.selectionStart + audio.selectionDuration,
      { loop: currentStep !== 4 }
    );
  }, [audio.selectionStart, audio.selectionDuration, currentStep, engineSetLoop]);

  // Active-word derivation from real engine playhead
  const playheadTime = engine.currentTime;
  const activeWordId = useMemo(() => {
    for (const block of lyrics) {
      for (const word of block.words) {
        if (playheadTime >= word.startTime && playheadTime < word.endTime) return word.id;
      }
    }
    return null;
  }, [playheadTime, lyrics]);

  // Audio handlers — local-first. Upload is deferred to Confirm.
  const handleAudioSelected = useCallback(async (file: File) => {
    const MAX_BYTES = 50 * 1024 * 1024;
    const isAudio = file.type.startsWith('audio/') ||
      /\.(mp3|wav|m4a|mp4|aac|flac|ogg|oga)$/i.test(file.name);
    if (!isAudio) {
      toast.error('Unsupported file type. Use MP3, WAV, M4A, AAC, FLAC, or OGG.');
      return;
    }
    if (file.size > MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      toast.error(`Audio file is too large (${mb} MB). Max 50 MB.`);
      return;
    }

    if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    const url = URL.createObjectURL(file);
    lastUrlRef.current = url;
    sourceFileRef.current = file;
    setAudioPlaybackUrl(url);
    // Reset any previous server-side state — the wizard is now fully local.
    setAudioAssetId(null);
    setTemplateId(null);

    const decoded = await decodeWaveform(file);
    const probedDuration = decoded.durationSec || 60;

    setAudio({
      ...INITIAL_AUDIO,
      fileName: file.name,
      fileUrl: url,
      totalDuration: Math.max(probedDuration, 15),
      selectionStart: 0,
      selectionDuration: 15,
      peaks: decoded.peaks,
      confirmed: false,
    });
    setAppState('trim');
    setTranscribeStatus('idle');
  }, []);

  // Debounced server patch helper
  const patchTimer = useRef<number | null>(null);
  const queuePatch = useCallback((patch: Parameters<typeof updateTemplate>[1]) => {
    if (!templateId) return;
    if (patchTimer.current) window.clearTimeout(patchTimer.current);
    patchTimer.current = window.setTimeout(() => {
      updateTemplate(templateId, patch).catch((e) =>
        console.warn('[lyrics] patch failed', e)
      );
    }, 600);
  }, [templateId]);

  const handleDurationChange = useCallback((d: ClipDuration) => {
    setAudio((prev) => {
      const maxStart = Math.max(0, prev.totalDuration - d);
      const start = Math.min(prev.selectionStart, maxStart);
      return { ...prev, selectionDuration: d, selectionStart: start };
    });
    queuePatch({
      selection: {
        startMs: Math.round(audio.selectionStart * 1000),
        durationMs: (d * 1000) as ClipDurationMs,
      },
    });
  }, [audio.selectionStart, queuePatch]);

  const handleZoomChange = useCallback((z: number) => {
    setAudio((prev) => ({ ...prev, zoom: z }));
  }, []);

  const handleSelectionStartChange = useCallback((s: number) => {
    setAudio((prev) => {
      const maxStart = Math.max(0, prev.totalDuration - prev.selectionDuration);
      const clamped = Math.max(0, Math.min(maxStart, s));
      return { ...prev, selectionStart: clamped };
    });
    queuePatch({
      selection: {
        startMs: Math.round(s * 1000),
        durationMs: (audio.selectionDuration * 1000) as ClipDurationMs,
      },
    });
  }, [audio.selectionDuration, queuePatch]);

  const togglePreview = useCallback(() => {
    engine.toggle();
  }, [engine]);

  const runTranscribe = useCallback(async (idArg?: string) => {
    const id = idArg ?? templateId;
    if (!id) return;
    setTranscribeStatus('transcribing');
    try {
      const result = await transcribeTemplate(id);
      setTranscribeStatus('parsing');
      await new Promise((r) => setTimeout(r, 300));
      setLyrics(blocksFromServer(result));
      setTranscribeStatus('ready');
    } catch (e) {
      console.error('[lyrics] transcribe failed', e);
      toast.error(e instanceof Error ? e.message : 'Transcription failed');
      setTranscribeStatus('failed');
    }
  }, [templateId]);

  const handleAudioConfirm = useCallback(async () => {
    const sourceFile = sourceFileRef.current;
    if (!sourceFile) {
      toast.error('No audio file loaded');
      return;
    }

    const toastId = 'kanvas-lyrics-confirm';
    const startMs = Math.round(audio.selectionStart * 1000);
    const durationMs = (audio.selectionDuration * 1000) as ClipDurationMs;

    try {
      // 1) Slice the trimmed clip locally
      toast.loading('Slicing clip…', { id: toastId });
      setTranscribeStatus('uploading');
      const baseName = sourceFile.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'clip';
      const clip = await sliceAudioToWav(
        sourceFile,
        audio.selectionStart,
        audio.selectionDuration,
        baseName
      );

      // 2) Upload only the trimmed clip
      toast.loading('Uploading clip…', { id: toastId });
      const uploaded = await uploadTemplateAudio({
        blob: clip.blob,
        fileName: clip.fileName,
        mimeType: clip.mimeType,
        durationMs: clip.durationMs,
      });
      setAudioAssetId(uploaded.assetId);

      // 3) Create draft template referencing the trimmed clip. The clip IS
      // the asset, so selectionStart=0 and totalDuration=clipDuration.
      const draft = await createTemplate({
        title: baseName || 'Untitled Template',
        sourceAudioAssetId: uploaded.assetId,
        totalDurationMs: clip.durationMs,
        selectionStartMs: 0,
        selectionDurationMs: durationMs,
        waveformPeaks: audio.peaks,
      });
      setTemplateId(draft.id);
      setSearchParams({ templateId: draft.id }, { replace: true });

      // 4) Mark ready and kick transcription. Re-point the engine at the
      // hosted clip so future steps still play after object URL is revoked.
      try {
        await updateTemplate(draft.id, {
          selection: { startMs: 0, durationMs },
          waveformPeaks: audio.peaks,
          status: 'audio_ready',
        });
      } catch (e) {
        console.warn('[lyrics] failed to mark audio_ready', e);
      }

      toast.success('Clip ready — transcribing…', { id: toastId });

      // Advance UI now that upload succeeded
      setAudio((prev) => ({
        ...prev,
        confirmed: true,
        // From here on the engine plays the hosted clip, which IS the
        // selection — selectionStart resets to 0.
        selectionStart: 0,
        totalDuration: clip.durationMs / 1000,
      }));
      setAppState('lyrics_edit');
      setCurrentStep(2);
      engine.seek(0);

      runTranscribe(draft.id);
    } catch (e) {
      console.error('[lyrics] confirm failed', e);
      toast.error(e instanceof Error ? e.message : 'Failed to prepare clip', { id: toastId });
      setTranscribeStatus('idle');
    }
  }, [audio.selectionStart, audio.selectionDuration, audio.peaks, engine, runTranscribe, setSearchParams]);

  const handleAudioReset = useCallback(() => {
    if (lastUrlRef.current) { URL.revokeObjectURL(lastUrlRef.current); lastUrlRef.current = null; }
    sourceFileRef.current = null;
    setAudio(INITIAL_AUDIO);
    setAudioPlaybackUrl(null);
    setAudioAssetId(null);
    setTemplateId(null);
    setAppState('upload');
    setCurrentStep(1);
    setTranscribeStatus('idle');
    engine.pause();
    engine.load(null);
  }, [engine]);

  // Lyric handlers
  const handleWordChange = useCallback((blockId: string, wordId: string, text: string) => {
    setLyrics((prev) => {
      const next = prev.map((b) =>
        b.id === blockId
          ? { ...b, words: b.words.map((w) => (w.id === wordId ? { ...w, text } : w)) }
          : b
      );
      queuePatch({ lyricBlocks: blocksToServer(next) });
      return next;
    });
  }, [queuePatch]);

  const handleManualEntry = useCallback(() => {
    setTranscribeStatus('ready');
    if (lyrics.length === 0) {
      const blockDuration = Math.min(audio.selectionDuration, 8);
      const placeholder: LyricBlock = {
        id: `block-${Date.now()}`,
        label: 'BLOCK 1',
        startTime: 0,
        endTime: blockDuration,
        words: ['type', 'your', 'lyrics', 'here'].map((text, i) => ({
          id: `w-${Date.now()}-${i}`,
          text,
          startTime: (blockDuration / 4) * i,
          endTime: (blockDuration / 4) * (i + 1),
        })),
      };
      setLyrics([placeholder]);
      queuePatch({ lyricBlocks: blocksToServer([placeholder]) });
    }
  }, [lyrics.length, audio.selectionDuration, queuePatch]);

  const handleLyricsDone = useCallback(() => {
    setAppState('markers_edit');
    setCurrentStep(3);
    engine.pause();
    engine.seek(0);
    if (templateId) {
      updateTemplate(templateId, {
        lyricBlocks: blocksToServer(lyrics),
        status: 'lyrics_ready',
      }).catch(() => {});
    }
  }, [templateId, lyrics, engine]);

  const handleMarkersDone = useCallback(() => {
    setAppState('visualize');
    setCurrentStep(4);
    engine.pause();
    engine.seek(0);
    if (templateId) {
      updateTemplate(templateId, {
        cutMarkers: markersToServer(markers),
        status: 'markers_ready',
      }).catch(() => {});
    }
  }, [templateId, markers, engine]);

  const handleReplay = useCallback(() => {
    engine.pause();
    engine.seek(0);
    setTimeout(() => engine.play?.(), 60);
  }, [engine]);

  // Marker handlers
  const handleAddMarker = useCallback(() => {
    setMarkers((prev) => {
      const next = [
        ...prev,
        { id: `m-${Date.now()}-${prev.length}`, timestamp: engine.currentTime },
      ];
      queuePatch({ cutMarkers: markersToServer(next) });
      return next;
    });
  }, [engine, queuePatch]);

  const handleUndoMarker = useCallback(() => {
    setMarkers((prev) => {
      const next = prev.slice(0, -1);
      queuePatch({ cutMarkers: markersToServer(next) });
      return next;
    });
  }, [queuePatch]);

  const handleMarkerDrag = useCallback((id: string, sec: number) => {
    setMarkers((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, timestamp: sec } : m));
      queuePatch({ cutMarkers: markersToServer(next) });
      return next;
    });
  }, [queuePatch]);

  const handleMarkerDelete = useCallback((id: string) => {
    setMarkers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      queuePatch({ cutMarkers: markersToServer(next) });
      return next;
    });
  }, [queuePatch]);

  const togglePlay = useCallback(() => engine.toggle(), [engine]);
  const handleSeek = useCallback((sec: number) => engine.seek(sec), [engine]);

  const handleSave = useCallback(async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      await updateTemplate(templateId, {
        lyricBlocks: blocksToServer(lyrics),
        cutMarkers: markersToServer(markers),
      });
      await finalizeTemplate(templateId);
      toast.success('Template saved');
      setSearchParams({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [templateId, lyrics, markers, setSearchParams]);

  const wordCount = useMemo(() => lyrics.reduce((s, b) => s + b.words.length, 0), [lyrics]);

  if (!showWizard) {
    return (
      <div className="min-h-screen bg-[#050506] text-white">
        <KanvasLyricsHeader />
        <TemplatesLanding
          onCreate={() => setSearchParams({ mode: 'new' })}
          onOpen={(t) => setSearchParams({ templateId: t.id })}
        />
      </div>
    );
  }

  if (hydrating) {
    return (
      <div className="min-h-screen bg-[#050506] text-white">
        <KanvasLyricsHeader />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-[#f97316]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050506] pb-28 text-white">
      <KanvasLyricsHeader />

      <div className="px-6 pb-8 pt-10 text-center">
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-300 transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to templates
        </button>
        <h1 className="bg-gradient-to-r from-[#fdba74] via-white to-[#f97316] bg-clip-text text-5xl font-black tracking-[0.16em] text-transparent md:text-7xl">
          CREATE TEMPLATE
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-xs uppercase tracking-[0.32em] text-zinc-500">
          Audio · Lyrics · Markers · Preview
        </p>
      </div>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-5 px-6 pb-24 lg:grid-cols-3">
        <AudioPanel
          currentStep={currentStep}
          audio={audio}
          isPlaying={engine.isPlaying && currentStep === 1}
          audioReady={engine.isReady}
          playheadTime={currentStep === 1 ? playheadTime : 0}
          onAudioSelected={handleAudioSelected}
          onDurationChange={handleDurationChange}
          onZoomChange={handleZoomChange}
          onSelectionStartChange={handleSelectionStartChange}
          onSeekClipRelative={handleSeek}
          onTogglePreview={togglePreview}
          onConfirm={handleAudioConfirm}
          onReset={handleAudioReset}
        />
        <LyricsPanel
          currentStep={currentStep}
          blocks={lyrics}
          activeWordId={activeWordId}
          isPlaying={engine.isPlaying && currentStep === 2}
          playheadTime={playheadTime}
          duration={audio.selectionDuration}
          transcribeStatus={transcribeStatus}
          onTogglePlay={togglePlay}
          onWordChange={handleWordChange}
          onDone={handleLyricsDone}
          onRetryTranscribe={runTranscribe}
          onManualEntry={handleManualEntry}
        />
        <MarkersPanel
          currentStep={currentStep}
          markers={markers}
          peaks={audio.peaks}
          playheadTime={playheadTime}
          duration={audio.selectionDuration}
          isPlaying={engine.isPlaying && currentStep === 3}
          zoom={audio.zoom}
          onZoomChange={handleZoomChange}
          onTogglePlay={togglePlay}
          onAddMarker={handleAddMarker}
          onUndoMarker={handleUndoMarker}
          onSeek={handleSeek}
          onMarkerDrag={handleMarkerDrag}
          onMarkerDelete={handleMarkerDelete}
          onPreview={handleMarkersDone}
        />
      </main>

      {currentStep === 4 && (
        <section className="mx-auto max-w-[1400px] px-6 pb-24">
          <VisualizePanel
            currentStep={currentStep}
            blocks={lyrics}
            markers={markers}
            playheadTime={playheadTime}
            duration={audio.selectionDuration}
            isPlaying={engine.isPlaying && currentStep === 4}
            saving={saving}
            onTogglePlay={togglePlay}
            onReplay={handleReplay}
            onSave={handleSave}
          />
        </section>
      )}

      <button
        type="button"
        aria-label="Help"
        className="fixed bottom-24 right-6 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#f97316]/40 bg-[#11131A] text-[#fb923c] shadow-[0_0_22px_rgba(249,115,22,0.3)] transition-colors hover:bg-[#f97316]/10"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      <KanvasLyricsFooter
        currentStep={currentStep}
        audioConfirmed={audio.confirmed}
        selectionDuration={audio.selectionDuration}
        wordCount={wordCount}
        markerCount={markers.length}
        onSave={handleSave}
      />

      {saving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-[#f97316]/30 bg-[#0F1116] p-6 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f97316]" />
            <p className="mt-3 text-xs uppercase tracking-[0.22em] text-zinc-300">Saving template…</p>
          </div>
        </div>
      )}

      <span className="sr-only">{appState}</span>
    </div>
  );
};

export default KanvasLyrics;
