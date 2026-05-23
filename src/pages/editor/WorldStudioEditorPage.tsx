import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Redo2, Save, Scissors, Trash2, Undo2, Wand2 } from "lucide-react";
import {
  duplicateEditorProject,
  getEditorProject,
  listEditorRevisions,
  restoreEditorRevision,
  saveEditorRevision,
  type EditorProjectResponse,
  type EditorRevisionRecord,
} from "@/lib/editor/api";
import {
  deleteEditorAsset,
  importEditorLibraryItem,
  importEditorMediaAsset,
  importEditorSourceCandidate,
  listEditorAssets,
  type EditorAssetRecord,
} from "@/lib/editor/assetApi";
import { createEditorState, editorReducer, type EditorState } from "@/lib/editor/store";
import {
  addAssetToTimelineCommand,
  addMarkerCommand,
  deleteClipCommand,
  deleteMarkerCommand,
  moveClipCommand,
  redoCommand,
  splitClipCommand,
  updateClipLyricsBlockCommand,
  updateClipStyleCommand,
  updateClipTextCommand,
  updateClipTransformCommand,
  updateProjectSettingsCommand,
  updateRenderSettingsCommand,
  updateTrackSettingsCommand,
  trimClipEndCommand,
  trimClipStartCommand,
  undoCommand,
} from "@/lib/editor/commands";
import { selectActiveClipsAtTime, selectTracksOrdered } from "@/lib/editor/selectors";
import { selectPreviewLayersAtTime } from "@/lib/editor/preview";
import { editorShortcutForKeyEvent } from "@/lib/editor/keyboard";
import {
  addEditorRenderToLibrary,
  createEditorRenderJob,
  type EditorRenderJob,
} from "@/lib/editor/renderApi";
import { appRoutes } from "@/lib/routes";
import { DEFAULT_EDITOR_TRANSFORM } from "@/lib/editor/schema";
import { validateEditorSnapshot } from "@/lib/editor/validation";
import type {
  EditorAspectRatio,
  EditorMarker,
  EditorRenderSettings,
  EditorTrack,
} from "@/lib/editor/schema";

const AUTOSAVE_DEBOUNCE_MS = 1200;

export default function WorldStudioEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<EditorProjectResponse | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [renderAudioClipId, setRenderAudioClipId] = useState("");
  const [renderJob, setRenderJob] = useState<EditorRenderJob | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<EditorRevisionRecord[]>([]);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [editorAssets, setEditorAssets] = useState<EditorAssetRecord[]>([]);
  const [mediaAssetId, setMediaAssetId] = useState("");
  const [libraryItemId, setLibraryItemId] = useState("");
  const [sourceCandidateId, setSourceCandidateId] = useState("");
  const [assetBusy, setAssetBusy] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [textDraft, setTextDraft] = useState("");
  const [lyricBlockDraft, setLyricBlockDraft] = useState("");
  const [styleDraft, setStyleDraft] = useState({ fontSize: "", color: "" });
  const [transformDraft, setTransformDraft] = useState({
    x: "",
    y: "",
    scale: "",
    rotation: "",
    opacity: "",
  });
  const [projectSettingsDraft, setProjectSettingsDraft] = useState({
    title: "",
    aspectRatio: "9:16" as EditorAspectRatio,
    durationSeconds: "",
    background: "",
  });
  const [renderSettingsDraft, setRenderSettingsDraft] = useState({
    quality: "standard" as EditorRenderSettings["quality"],
    fps: "30",
    includeCaptions: true,
  });
  const [markerDraft, setMarkerDraft] = useState({
    label: "",
    kind: "cut" as EditorMarker["kind"],
  });
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getEditorProject(projectId);
        if (cancelled) return;
        setData(result);
        setState(createEditorState(result.snapshot));
        const [assetRows, revisionRows] = await Promise.all([
          listEditorAssets(result.project.id),
          listEditorRevisions(result.project.id),
        ]);
        if (!cancelled) {
          setEditorAssets(assetRows.assets);
          setRevisionHistory(revisionRows.revisions);
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !data || !state?.dirty) return;
    setAutosaveStatus("saving");
    const snapshot = state.snapshot;
    const timeoutId = window.setTimeout(() => {
      void saveEditorRevision({
        projectId,
        snapshot,
        autosave: true,
        baseRevisionNumber: data.revision.revision_number,
      })
        .then((result) => {
          setData(result);
          setState((current) =>
            current?.snapshot === snapshot ? { ...current, dirty: false } : current,
          );
          setAutosaveStatus("saved");
          void listEditorRevisions(projectId).then((rows) => setRevisionHistory(rows.revisions));
        })
        .catch((error) => {
          setAutosaveStatus("error");
          setMessage(error instanceof Error ? error.message : String(error));
        });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [data, projectId, state]);

  const activeClips = useMemo(
    () => (state ? selectActiveClipsAtTime(state.snapshot, playheadMs) : []),
    [state, playheadMs],
  );
  const previewLayers = useMemo(
    () =>
      state ? selectPreviewLayersAtTime(state.snapshot, playheadMs) : { visual: [], audio: [] },
    [state, playheadMs],
  );
  const tracks = useMemo(() => (state ? selectTracksOrdered(state.snapshot) : []), [state]);
  const projectHealth = useMemo(() => {
    if (!state) {
      return {
        isValid: false,
        validationMessage: "Editor project is still loading.",
        saveReadiness: "Loading project",
        renderReadiness: "Loading project",
      };
    }

    try {
      validateEditorSnapshot(state.snapshot);
      return {
        isValid: true,
        validationMessage: "Validation: ready",
        saveReadiness: state.dirty
          ? "Save readiness: unsaved edits ready to save"
          : "Save readiness: already saved",
        renderReadiness: "Render readiness: current snapshot can be queued",
      };
    } catch (error) {
      const validationMessage = `Validation issue: ${error instanceof Error ? error.message : String(error)}`;
      return {
        isValid: false,
        validationMessage,
        saveReadiness: "Save readiness: blocked by validation",
        renderReadiness: "Render readiness: blocked by validation",
      };
    }
  }, [state]);
  const selectedClip = useMemo(
    () => state?.snapshot.clips.find((clip) => clip.id === selectedClipId) ?? null,
    [state, selectedClipId],
  );
  const selectedLyricBlock = selectedClip?.lyrics?.blocks[0] ?? null;

  useEffect(() => {
    setTextDraft(selectedClip?.text?.text ?? "");
    setLyricBlockDraft(selectedLyricBlock?.text ?? "");
    setStyleDraft({
      fontSize: selectedClip?.style?.fontSize ? String(selectedClip.style.fontSize) : "",
      color: selectedClip?.style?.color ?? "",
    });
    setTransformDraft({
      x: selectedClip ? String(selectedClip.transform.x) : "",
      y: selectedClip ? String(selectedClip.transform.y) : "",
      scale: selectedClip ? String(selectedClip.transform.scaleX) : "",
      rotation: selectedClip ? String(selectedClip.transform.rotation) : "",
      opacity: selectedClip ? String(selectedClip.transform.opacity) : "",
    });
  }, [selectedClip, selectedLyricBlock]);

  useEffect(() => {
    if (!state) return;
    setProjectSettingsDraft({
      title: state.snapshot.project.title,
      aspectRatio: state.snapshot.project.aspectRatio,
      durationSeconds: String(Math.round(state.snapshot.project.durationMs / 1000)),
      background: state.snapshot.project.background,
    });
  }, [
    state?.snapshot.project.title,
    state?.snapshot.project.aspectRatio,
    state?.snapshot.project.durationMs,
    state?.snapshot.project.background,
  ]);

  useEffect(() => {
    if (!state) return;
    setRenderSettingsDraft({
      quality: state.snapshot.renderSettings.quality,
      fps: String(state.snapshot.renderSettings.fps),
      includeCaptions: state.snapshot.renderSettings.includeCaptions,
    });
  }, [
    state?.snapshot.renderSettings.quality,
    state?.snapshot.renderSettings.fps,
    state?.snapshot.renderSettings.includeCaptions,
  ]);

  function applyProjectSettings() {
    if (!state) return;
    const durationSeconds = Number(projectSettingsDraft.durationSeconds);
    setState(
      editorReducer(
        state,
        updateProjectSettingsCommand({
          title: projectSettingsDraft.title,
          aspectRatio: projectSettingsDraft.aspectRatio,
          durationMs: Number.isFinite(durationSeconds) ? durationSeconds * 1000 : undefined,
          background: projectSettingsDraft.background || undefined,
        }),
      ),
    );
    setPlayheadMs((current) =>
      Math.min(
        current,
        Number.isFinite(durationSeconds)
          ? durationSeconds * 1000
          : state.snapshot.project.durationMs,
      ),
    );
    setMessage("Project settings updated.");
  }

  function toggleTrackSetting(trackId: string, key: "locked" | "muted" | "hidden", value: boolean) {
    if (!state) return;
    setState(editorReducer(state, updateTrackSettingsCommand(trackId, { [key]: value })));
    setMessage("Track settings updated.");
  }

  function applyRenderSettings() {
    if (!state) return;
    const fps = Number(renderSettingsDraft.fps);
    setState(
      editorReducer(
        state,
        updateRenderSettingsCommand({
          quality: renderSettingsDraft.quality,
          fps: Number.isFinite(fps) ? fps : undefined,
          includeCaptions: renderSettingsDraft.includeCaptions,
        }),
      ),
    );
    setMessage("Render settings updated.");
  }

  function addMarkerAtPlayhead() {
    if (!state) return;
    const marker: EditorMarker = {
      id: `marker-${Date.now()}`,
      timeMs: playheadMs,
      kind: markerDraft.kind,
      label: markerDraft.label.trim() || `${markerDraft.kind} @ ${Math.round(playheadMs / 1000)}s`,
    };
    setState(editorReducer(state, addMarkerCommand(marker)));
    setMarkerDraft((draft) => ({ ...draft, label: "" }));
    setMessage("Marker added at playhead.");
  }

  function deleteMarker(markerId: string) {
    if (!state) return;
    setState(editorReducer(state, deleteMarkerCommand(markerId)));
    setMessage("Marker deleted.");
  }

  function validateSnapshotForAction(action: "save" | "render"): boolean {
    if (!state) return false;
    try {
      validateEditorSnapshot(state.snapshot);
      return true;
    } catch (error) {
      const prefix = action === "save" ? "Cannot save: " : "Cannot render: ";
      setMessage(`${prefix}${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async function saveNow() {
    if (!projectId || !state) return;
    if (!validateSnapshotForAction("save")) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveEditorRevision({
        projectId,
        snapshot: state.snapshot,
        autosave: false,
        baseRevisionNumber: data.revision.revision_number,
      });
      setData(result);
      setState(createEditorState(result.snapshot));
      setAutosaveStatus("saved");
      setMessage("Saved editor revision.");
      void loadRevisionHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function loadRevisionHistory() {
    if (!projectId) return;
    setRevisionBusy(true);
    setMessage(null);
    try {
      const result = await listEditorRevisions(projectId);
      setRevisionHistory(result.revisions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRevisionBusy(false);
    }
  }

  async function restoreRevision(revisionId: string, revisionNumber: number) {
    if (!projectId) return;
    setRevisionBusy(true);
    setMessage(null);
    try {
      const result = await restoreEditorRevision({ projectId, revisionId });
      setData(result);
      setState(createEditorState(result.snapshot));
      setSelectedClipId(null);
      setAutosaveStatus("saved");
      const revisionRows = await listEditorRevisions(projectId);
      setRevisionHistory(revisionRows.revisions);
      setMessage(`Restored revision #${revisionNumber}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRevisionBusy(false);
    }
  }

  async function duplicateProject() {
    if (!projectId || !state) return;
    setDuplicating(true);
    setMessage(null);
    try {
      const result = await duplicateEditorProject({
        projectId,
        title: `${state.snapshot.project.title} remix`,
      });
      setMessage("Duplicate / remix project created.");
      navigate(appRoutes.editorProject(result.project.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDuplicating(false);
    }
  }

  async function importMediaAsset() {
    if (!projectId || !mediaAssetId.trim()) {
      setMessage("Paste a mediaAssetId before importing.");
      return;
    }
    setAssetBusy(true);
    setMessage(null);
    try {
      await importEditorMediaAsset({ projectId, mediaAssetId: mediaAssetId.trim() });
      const assetRows = await listEditorAssets(projectId);
      setEditorAssets(assetRows.assets);
      setMediaAssetId("");
      setMessage("Media asset imported into Media bin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAssetBusy(false);
    }
  }

  async function importLibraryItemAsset() {
    if (!projectId || !libraryItemId.trim()) {
      setMessage("Paste a libraryItemId before importing.");
      return;
    }
    setAssetBusy(true);
    setMessage(null);
    try {
      await importEditorLibraryItem({ projectId, libraryItemId: libraryItemId.trim() });
      const assetRows = await listEditorAssets(projectId);
      setEditorAssets(assetRows.assets);
      setLibraryItemId("");
      setMessage("Library item imported into Media bin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAssetBusy(false);
    }
  }

  async function importSourceCandidateAsset() {
    if (!projectId || !sourceCandidateId.trim()) {
      setMessage("Paste a sourceCandidateId before importing.");
      return;
    }
    setAssetBusy(true);
    setMessage(null);
    try {
      await importEditorSourceCandidate({ projectId, sourceCandidateId: sourceCandidateId.trim() });
      const assetRows = await listEditorAssets(projectId);
      setEditorAssets(assetRows.assets);
      setSourceCandidateId("");
      setMessage("Source candidate imported into Media bin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAssetBusy(false);
    }
  }

  function assetIsUsedOnTimeline(asset: EditorAssetRecord): boolean {
    return state?.snapshot.clips.some((clip) => clip.assetId === asset.id) ?? false;
  }

  async function removeEditorAsset(asset: EditorAssetRecord) {
    if (!projectId) return;
    if (assetIsUsedOnTimeline(asset)) {
      setMessage("Asset is used on timeline. Delete its clips before removing it from Media bin.");
      return;
    }
    setAssetBusy(true);
    setMessage(null);
    try {
      await deleteEditorAsset({ projectId, editorAssetId: asset.id });
      setEditorAssets((items) => items.filter((item) => item.id !== asset.id));
      setState((current) =>
        current
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                assets: current.snapshot.assets.filter((item) => item.id !== asset.id),
              },
              dirty: current.dirty || current.snapshot.assets.some((item) => item.id === asset.id),
            }
          : current,
      );
      setMessage("Unused Media bin asset removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAssetBusy(false);
    }
  }

  async function renderDraft() {
    if (!projectId || !data) return;
    if (!validateSnapshotForAction("render")) return;
    setRendering(true);
    setMessage(null);
    try {
      const result = await createEditorRenderJob({
        projectId,
        revisionId: data.revision.id,
        provider: "mock",
        renderSettings: state?.snapshot.renderSettings ?? {},
      });
      setRenderJob(result.render_job);
      setMessage("Mock render complete.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRendering(false);
    }
  }

  async function addRenderToLibrary() {
    if (!renderJob) return;
    setAddingToLibrary(true);
    setMessage(null);
    try {
      const result = await addEditorRenderToLibrary({
        renderJobId: renderJob.id,
        accountId: data?.project.account_id ?? undefined,
        audioClipId: renderAudioClipId.trim() || undefined,
        defaultCaption: state?.snapshot.project.title,
      });
      setRenderJob(result.render_job);
      setMessage("Editor render added to Library.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAddingToLibrary(false);
    }
  }

  function scheduleRenderOutput() {
    navigate("/?mode=studio&view=calendar");
  }

  function addAssetToTimeline(asset: EditorAssetRecord) {
    if (!state) return;
    const snapshotAsset = {
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      mediaAssetId: asset.media_asset_id,
      projectAssetId: asset.project_asset_id,
      libraryItemId: asset.library_item_id,
      sourceCandidateId: asset.source_candidate_id,
      publicUrl: asset.public_url,
      storageBucket: asset.storage_bucket,
      storagePath: asset.storage_path,
      durationMs: asset.duration_ms,
      width: asset.width,
      height: asset.height,
      thumbnailUrl: asset.thumbnail_url,
      provenance: asset.provenance,
      metadata: asset.metadata,
    };
    const stateWithAsset = state.snapshot.assets.some((item) => item.id === asset.id)
      ? state
      : {
          ...state,
          snapshot: { ...state.snapshot, assets: [...state.snapshot.assets, snapshotAsset] },
        };
    setState(
      editorReducer(
        stateWithAsset,
        addAssetToTimelineCommand({
          assetId: asset.id,
          clipId: `clip-${asset.id}-${Date.now()}`,
          startMs: playheadMs,
        }),
      ),
    );
    setMessage(`${asset.name} added to timeline.`);
  }

  function splitFirstClip() {
    if (!state) return;
    const clip = state.snapshot.clips.find(
      (item) => playheadMs > item.startMs && playheadMs < item.startMs + item.durationMs,
    );
    if (!clip) {
      setMessage("Move the playhead inside a clip before splitting.");
      return;
    }
    setState(
      editorReducer(state, splitClipCommand(clip.id, playheadMs, `${clip.id}-right-${Date.now()}`)),
    );
  }

  function splitSelectedClip() {
    if (!state || !selectedClip) {
      splitFirstClip();
      return;
    }
    if (
      playheadMs <= selectedClip.startMs ||
      playheadMs >= selectedClip.startMs + selectedClip.durationMs
    ) {
      setMessage("Move the playhead inside the selected clip before splitting.");
      return;
    }
    const rightClipId = `${selectedClip.id}-right-${Date.now()}`;
    setState(editorReducer(state, splitClipCommand(selectedClip.id, playheadMs, rightClipId)));
    setSelectedClipId(rightClipId);
    setMessage("Selected clip split at playhead.");
  }

  function moveSelectedClip(deltaMs: number) {
    if (!state || !selectedClip) {
      setMessage("Select clip before moving it.");
      return;
    }
    setState(
      editorReducer(
        state,
        moveClipCommand(selectedClip.id, { startMs: selectedClip.startMs + deltaMs }),
      ),
    );
    setMessage("Selected clip moved.");
  }

  function trimSelectedClipStart(deltaMs: number) {
    if (!state || !selectedClip) {
      setMessage("Select clip before trimming it.");
      return;
    }
    setState(
      editorReducer(state, trimClipStartCommand(selectedClip.id, selectedClip.startMs + deltaMs)),
    );
    setMessage("Selected clip start trimmed.");
  }

  function trimSelectedClipEnd(deltaMs: number) {
    if (!state || !selectedClip) {
      setMessage("Select clip before trimming it.");
      return;
    }
    setState(
      editorReducer(
        state,
        trimClipEndCommand(
          selectedClip.id,
          selectedClip.startMs + selectedClip.durationMs + deltaMs,
        ),
      ),
    );
    setMessage("Selected clip end trimmed.");
  }

  function deleteSelectedClip() {
    if (!state || !selectedClip) {
      setMessage("Select clip before deleting it.");
      return;
    }
    setState(editorReducer(state, deleteClipCommand(selectedClip.id)));
    setSelectedClipId(null);
    setMessage("Selected clip deleted.");
  }

  function applyTransformChanges() {
    if (!state || !selectedClip) {
      setMessage("Select a visual clip before editing transform.");
      return;
    }
    const x = Number(transformDraft.x);
    const y = Number(transformDraft.y);
    const scale = Number(transformDraft.scale);
    const rotation = Number(transformDraft.rotation);
    const opacity = Number(transformDraft.opacity);
    setState(
      editorReducer(
        state,
        updateClipTransformCommand(selectedClip.id, {
          ...(Number.isFinite(x) ? { x } : {}),
          ...(Number.isFinite(y) ? { y } : {}),
          ...(Number.isFinite(scale) && scale > 0 ? { scaleX: scale, scaleY: scale } : {}),
          ...(Number.isFinite(rotation) ? { rotation } : {}),
          ...(Number.isFinite(opacity) ? { opacity } : {}),
        }),
      ),
    );
    setMessage("Transform controls applied.");
  }

  function resetSelectedTransform() {
    if (!state || !selectedClip) {
      setMessage("Select a visual clip before resetting transform.");
      return;
    }
    setState(editorReducer(state, updateClipTransformCommand(selectedClip.id, { reset: true })));
    setTransformDraft({
      x: String(DEFAULT_EDITOR_TRANSFORM.x),
      y: String(DEFAULT_EDITOR_TRANSFORM.y),
      scale: String(DEFAULT_EDITOR_TRANSFORM.scaleX),
      rotation: String(DEFAULT_EDITOR_TRANSFORM.rotation),
      opacity: String(DEFAULT_EDITOR_TRANSFORM.opacity),
    });
    setMessage("Transform reset.");
  }

  function applyTextChanges() {
    if (!state || !selectedClip) {
      setMessage("Select a text or lyrics clip before editing content.");
      return;
    }
    let nextState = state;
    if (selectedClip.text) {
      nextState = editorReducer(nextState, updateClipTextCommand(selectedClip.id, textDraft));
    }
    if (selectedClip.lyrics && selectedLyricBlock) {
      nextState = editorReducer(
        nextState,
        updateClipLyricsBlockCommand(selectedClip.id, selectedLyricBlock.id, lyricBlockDraft),
      );
    }
    const fontSize = Number(styleDraft.fontSize);
    if (styleDraft.color || Number.isFinite(fontSize)) {
      nextState = editorReducer(
        nextState,
        updateClipStyleCommand(selectedClip.id, {
          ...(styleDraft.color ? { color: styleDraft.color } : {}),
          ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
        }),
      );
    }
    setState(nextState);
    setMessage("Text / lyrics inspector changes applied.");
  }

  function togglePlayback() {
    setIsPlaying((playing) => !playing);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const action = editorShortcutForKeyEvent({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        targetTagName: event.target instanceof HTMLElement ? event.target.tagName : null,
      });
      if (!action) return;
      event.preventDefault();
      if (action === "togglePlayback") togglePlayback();
      if (action === "undo" && state) setState(editorReducer(state, undoCommand()));
      if (action === "redo" && state) setState(editorReducer(state, redoCommand()));
      if (action === "deleteSelectedClip") deleteSelectedClip();
      if (action === "splitSelectedClip") splitSelectedClip();
      if (action === "nudgeSelectedClipLeft") moveSelectedClip(-100);
      if (action === "nudgeSelectedClipRight") moveSelectedClip(100);
      if (action === "nudgePlayheadLeft") setPlayheadMs((current) => Math.max(0, current - 100));
      if (action === "nudgePlayheadRight") {
        setPlayheadMs((current) =>
          Math.min(state?.snapshot.project.durationMs ?? current + 100, current + 100),
        );
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, selectedClip, selectedLyricBlock, textDraft, lyricBlockDraft, styleDraft]);

  if (!state || !data) {
    return (
      <main className="page editor-page">
        <header className="page-header">
          <Link to={appRoutes.home} className="button ghost">
            <ChevronLeft size={14} /> Back
          </Link>
          <h1>WorldStudio Editor</h1>
          <span />
        </header>
        <div className={message ? "status-pill bad" : "lyrics-loading"}>
          {message ?? "Loading editor…"}
        </div>
      </main>
    );
  }

  return (
    <main className="page editor-page">
      <header className="page-header">
        <Link to={appRoutes.home} className="button ghost">
          <ChevronLeft size={14} /> Back
        </Link>
        <h1>WorldStudio Editor — {state.snapshot.project.title}</h1>
        <button
          type="button"
          className="button primary"
          onClick={() => void saveNow()}
          disabled={saving || !projectHealth.isValid}
        >
          <Save size={14} /> {saving ? "Saving…" : "Save"}
        </button>
        <span
          className={`status-pill ${autosaveStatus === "error" ? "bad" : autosaveStatus === "saved" ? "good" : "idle"}`}
        >
          {autosaveStatus === "saving"
            ? "Autosaving…"
            : autosaveStatus === "saved"
              ? "Autosaved"
              : autosaveStatus === "error"
                ? "Autosave failed"
                : state.dirty
                  ? "Unsaved changes"
                  : "Saved"}
        </span>
        <button
          type="button"
          className="button ghost"
          onClick={() => void duplicateProject()}
          disabled={duplicating}
        >
          {duplicating ? "Duplicating…" : "Duplicate / remix"}
        </button>
      </header>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Project health</h2>
          <span className={`status-pill ${projectHealth.isValid ? "good" : "bad"}`}>
            {projectHealth.validationMessage}
          </span>
        </div>
        <div className="library-segments">
          <span className="library-segment-chip">{projectHealth.saveReadiness}</span>
          <span className="library-segment-chip">{projectHealth.renderReadiness}</span>
          <span className="library-segment-chip">
            Dirty state: {state.dirty ? "unsaved changes" : "saved revision"}
          </span>
          <span className="library-segment-chip">Autosave: {autosaveStatus}</span>
        </div>
        {!projectHealth.isValid ? <small>Disabled until snapshot validation passes.</small> : null}
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Project settings</h2>
          <span className="status-pill idle">
            {state.snapshot.project.width}×{state.snapshot.project.height}
          </span>
        </div>
        <label>
          Project title
          <input
            value={projectSettingsDraft.title}
            onChange={(event) =>
              setProjectSettingsDraft((draft) => ({ ...draft, title: event.target.value }))
            }
          />
        </label>
        <label>
          Aspect ratio
          <select
            value={projectSettingsDraft.aspectRatio}
            onChange={(event) =>
              setProjectSettingsDraft((draft) => ({
                ...draft,
                aspectRatio: event.target.value as EditorAspectRatio,
              }))
            }
          >
            <option value="9:16">9:16 vertical</option>
            <option value="1:1">1:1 square</option>
            <option value="16:9">16:9 landscape</option>
          </select>
        </label>
        <label>
          Duration seconds
          <input
            type="number"
            min={1}
            max={600}
            value={projectSettingsDraft.durationSeconds}
            onChange={(event) =>
              setProjectSettingsDraft((draft) => ({
                ...draft,
                durationSeconds: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Canvas background
          <input
            value={projectSettingsDraft.background}
            placeholder="#000000"
            onChange={(event) =>
              setProjectSettingsDraft((draft) => ({ ...draft, background: event.target.value }))
            }
          />
        </label>
        <button type="button" className="button ghost" onClick={applyProjectSettings}>
          Apply project settings
        </button>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Preview canvas</h2>
          <span className="status-pill idle">
            {state.snapshot.project.aspectRatio} • {isPlaying ? "Playing" : "Paused"}
          </span>
        </div>
        <div
          className="remix-preview-stage"
          style={{
            aspectRatio: `${state.snapshot.project.width}/${state.snapshot.project.height}`,
            background: state.snapshot.project.background,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {previewLayers.visual.map((layer) => {
            const url =
              layer.asset?.publicUrl ?? layer.asset?.signedUrl ?? layer.asset?.thumbnailUrl;
            if (!url) return null;
            if (layer.clip.kind === "video") {
              return (
                <video
                  key={layer.clip.id}
                  src={url}
                  poster={layer.asset?.thumbnailUrl ?? undefined}
                  muted
                  playsInline
                  preload="metadata"
                  style={layer.style}
                  aria-label={`Preview video layer ${layer.asset?.name ?? layer.clip.id}`}
                />
              );
            }
            return (
              <img
                key={layer.clip.id}
                src={url}
                alt={layer.asset?.name ?? "Preview image layer"}
                style={layer.style}
              />
            );
          })}
          <div className="remix-preview-caption">
            {activeClips.find((clip) => clip.text)?.text?.text ??
              activeClips
                .find((clip) => clip.lyrics)
                ?.lyrics?.blocks.find(
                  (block) => playheadMs >= block.startMs && playheadMs <= block.endMs,
                )?.text ??
              (previewLayers.visual.length > 0 ? "" : "WorldStudio preview")}
          </div>
          {previewLayers.audio.map((layer) => {
            const url = layer.asset?.publicUrl ?? layer.asset?.signedUrl;
            if (!url) return null;
            return (
              <audio
                key={layer.clip.id}
                src={url}
                preload="metadata"
                aria-label="Preview audio layer"
              />
            );
          })}
        </div>
        <label>
          Playhead {playheadMs}ms
          <input
            type="range"
            min={0}
            max={state.snapshot.project.durationMs}
            step={100}
            value={playheadMs}
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>
        <div className="row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="button ghost"
            onClick={() => setState(editorReducer(state, undoCommand()))}
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => setState(editorReducer(state, redoCommand()))}
          >
            <Redo2 size={14} /> Redo
          </button>
          <button type="button" className="button ghost" onClick={splitSelectedClip}>
            <Scissors size={14} /> Split selected clip
          </button>
        </div>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Media bin</h2>
          <span className="status-pill idle">{editorAssets.length} assets</span>
        </div>
        <label>
          mediaAssetId
          <input
            value={mediaAssetId}
            placeholder="Paste existing media asset UUID"
            onChange={(event) => setMediaAssetId(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button ghost"
          onClick={() => void importMediaAsset()}
          disabled={assetBusy}
        >
          {assetBusy ? "Importing…" : "Import media asset"}
        </button>
        <label>
          libraryItemId
          <input
            value={libraryItemId}
            placeholder="Paste existing Library item UUID"
            onChange={(event) => setLibraryItemId(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button ghost"
          onClick={() => void importLibraryItemAsset()}
          disabled={assetBusy}
        >
          {assetBusy ? "Importing…" : "Import library item"}
        </button>
        <label>
          sourceCandidateId
          <input
            value={sourceCandidateId}
            placeholder="Paste existing Source candidate UUID"
            onChange={(event) => setSourceCandidateId(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button ghost"
          onClick={() => void importSourceCandidateAsset()}
          disabled={assetBusy}
        >
          {assetBusy ? "Importing…" : "Import source candidate"}
        </button>
        <div className="calendar-library-list">
          {editorAssets.length === 0 ? (
            <div className="empty-state">No editor assets imported yet.</div>
          ) : null}
          {editorAssets.map((asset) => (
            <div key={asset.id} className="calendar-library-card" style={{ textAlign: "left" }}>
              <strong>{asset.name}</strong>
              <small>
                {asset.kind} {asset.duration_ms ? `• ${Math.round(asset.duration_ms / 1000)}s` : ""}
              </small>
              <div className="row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => addAssetToTimeline(asset)}
                >
                  Add to timeline
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => void removeEditorAsset(asset)}
                  disabled={assetBusy || assetIsUsedOnTimeline(asset)}
                  title={
                    assetIsUsedOnTimeline(asset)
                      ? "Asset is used on timeline"
                      : "Remove unused asset"
                  }
                >
                  {assetIsUsedOnTimeline(asset)
                    ? "Asset is used on timeline"
                    : "Remove unused asset"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Layers / tracks</h2>
          <span className="status-pill idle">{tracks.length} tracks</span>
        </div>
        <div className="calendar-library-list">
          {tracks.map((track: EditorTrack) => (
            <div key={track.id} className="calendar-library-card" style={{ textAlign: "left" }}>
              <strong>{track.name}</strong>
              <small>
                {track.kind} • order {track.order}
              </small>
              <div className="row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <label className="library-segment-chip">
                  <input
                    type="checkbox"
                    checked={track.locked}
                    onChange={(event) =>
                      toggleTrackSetting(track.id, "locked", event.target.checked)
                    }
                  />
                  Lock track
                </label>
                <label className="library-segment-chip">
                  <input
                    type="checkbox"
                    checked={track.muted}
                    onChange={(event) =>
                      toggleTrackSetting(track.id, "muted", event.target.checked)
                    }
                  />
                  Mute track
                </label>
                <label className="library-segment-chip">
                  <input
                    type="checkbox"
                    checked={track.hidden}
                    onChange={(event) =>
                      toggleTrackSetting(track.id, "hidden", event.target.checked)
                    }
                  />
                  Hide track
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Timeline</h2>
          <span className="status-pill idle">{state.snapshot.clips.length} clips</span>
        </div>
        {tracks.map((track) => (
          <div key={track.id} className="calendar-library-card" style={{ textAlign: "left" }}>
            <strong>{track.name}</strong>
            <small>{track.kind}</small>
            <div className="library-segments">
              {state.snapshot.clips
                .filter((clip) => clip.trackId === track.id)
                .map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    className="library-segment-chip"
                    aria-pressed={selectedClipId === clip.id}
                    onClick={() => setSelectedClipId(clip.id)}
                  >
                    Select clip: {clip.kind} {clip.startMs}–{clip.startMs + clip.durationMs}ms
                  </button>
                ))}
            </div>
          </div>
        ))}
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Marker controls</h2>
          <span className="status-pill idle">{state.snapshot.markers.length} markers</span>
        </div>
        <label>
          Marker label
          <input
            value={markerDraft.label}
            placeholder="Hook, drop, cut point…"
            onChange={(event) =>
              setMarkerDraft((draft) => ({ ...draft, label: event.target.value }))
            }
          />
        </label>
        <label>
          Marker kind
          <select
            value={markerDraft.kind}
            onChange={(event) =>
              setMarkerDraft((draft) => ({
                ...draft,
                kind: event.target.value as EditorMarker["kind"],
              }))
            }
          >
            <option value="cut">cut</option>
            <option value="beat">beat</option>
            <option value="lyric">lyric</option>
            <option value="chapter">chapter</option>
          </select>
        </label>
        <button type="button" className="button ghost" onClick={addMarkerAtPlayhead}>
          Add marker at playhead
        </button>
        <div className="calendar-library-list">
          {state.snapshot.markers.length === 0 ? (
            <div className="empty-state">No markers yet. Add one at the current playhead.</div>
          ) : null}
          {state.snapshot.markers.map((marker) => (
            <div key={marker.id} className="calendar-library-card" style={{ textAlign: "left" }}>
              <strong>{marker.label ?? marker.kind}</strong>
              <small>
                {marker.kind} • {marker.timeMs}ms
              </small>
              <div className="row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setPlayheadMs(marker.timeMs)}
                >
                  Jump to marker
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => deleteMarker(marker.id)}
                >
                  Delete marker
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Clip inspector</h2>
          <span className="status-pill idle">
            {selectedClip ? selectedClip.kind : "no selection"}
          </span>
        </div>
        {selectedClip ? (
          <>
            <div className="calendar-library-card" style={{ textAlign: "left" }}>
              <strong>{selectedClip.kind} clip</strong>
              <small>
                Track {selectedClip.trackId} • {selectedClip.startMs}–
                {selectedClip.startMs + selectedClip.durationMs}ms
              </small>
            </div>
            <div className="row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="button" className="button ghost" onClick={() => moveSelectedClip(-500)}>
                Move selected clip -500ms
              </button>
              <button type="button" className="button ghost" onClick={() => moveSelectedClip(500)}>
                Move selected clip +500ms
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => trimSelectedClipStart(500)}
              >
                Trim start +500ms
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => trimSelectedClipStart(-500)}
              >
                Trim start -500ms
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => trimSelectedClipEnd(-500)}
              >
                Trim end -500ms
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => trimSelectedClipEnd(500)}
              >
                Trim end +500ms
              </button>
              <button type="button" className="button ghost" onClick={deleteSelectedClip}>
                <Trash2 size={14} /> Delete selected clip
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            Select clip from the timeline to move, trim, split, or delete it.
          </div>
        )}
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Transform controls</h2>
          <span className="status-pill idle">
            {selectedClip &&
            ["video", "image", "text", "lyrics", "caption", "shape"].includes(selectedClip.kind)
              ? selectedClip.kind
              : "no visual clip"}
          </span>
        </div>
        {selectedClip &&
        ["video", "image", "text", "lyrics", "caption", "shape"].includes(selectedClip.kind) ? (
          <>
            <label>
              Position X
              <input
                value={transformDraft.x}
                onChange={(event) =>
                  setTransformDraft((draft) => ({ ...draft, x: event.target.value }))
                }
              />
            </label>
            <label>
              Position Y
              <input
                value={transformDraft.y}
                onChange={(event) =>
                  setTransformDraft((draft) => ({ ...draft, y: event.target.value }))
                }
              />
            </label>
            <label>
              Scale
              <input
                value={transformDraft.scale}
                onChange={(event) =>
                  setTransformDraft((draft) => ({ ...draft, scale: event.target.value }))
                }
              />
            </label>
            <label>
              Rotation
              <input
                value={transformDraft.rotation}
                onChange={(event) =>
                  setTransformDraft((draft) => ({ ...draft, rotation: event.target.value }))
                }
              />
            </label>
            <label>
              Opacity
              <input
                value={transformDraft.opacity}
                onChange={(event) =>
                  setTransformDraft((draft) => ({ ...draft, opacity: event.target.value }))
                }
              />
            </label>
            <div className="row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="button" className="button primary" onClick={applyTransformChanges}>
                Apply transform
              </button>
              <button type="button" className="button ghost" onClick={resetSelectedTransform}>
                Reset transform
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            Select a visual clip to edit x/y position, scale, rotation, and opacity.
          </div>
        )}
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Text / lyrics inspector</h2>
          <span className="status-pill idle">
            {selectedClip?.text ? "text" : selectedClip?.lyrics ? "lyrics" : "no text clip"}
          </span>
        </div>
        {selectedClip?.text || selectedClip?.lyrics ? (
          <>
            {selectedClip.text ? (
              <label>
                Selected text
                <textarea
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                />
              </label>
            ) : null}
            {selectedClip.lyrics && selectedLyricBlock ? (
              <label>
                Selected lyric block
                <textarea
                  value={lyricBlockDraft}
                  onChange={(event) => setLyricBlockDraft(event.target.value)}
                />
              </label>
            ) : null}
            <label>
              Font size
              <input
                value={styleDraft.fontSize}
                onChange={(event) =>
                  setStyleDraft((draft) => ({ ...draft, fontSize: event.target.value }))
                }
              />
            </label>
            <label>
              Text color
              <input
                value={styleDraft.color}
                onChange={(event) =>
                  setStyleDraft((draft) => ({ ...draft, color: event.target.value }))
                }
                placeholder="#ffffff"
              />
            </label>
            <button type="button" className="button primary" onClick={applyTextChanges}>
              Apply text changes
            </button>
          </>
        ) : (
          <div className="empty-state">Select a text or lyrics clip to edit content and style.</div>
        )}
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Keyboard shortcuts</h2>
          <span className="status-pill idle">{isPlaying ? "playing" : "paused"}</span>
        </div>
        <div className="library-segments">
          <span className="library-segment-chip">Space play/pause</span>
          <span className="library-segment-chip">Cmd/Ctrl+Z undo</span>
          <span className="library-segment-chip">Cmd/Ctrl+Shift+Z redo</span>
          <span className="library-segment-chip">Delete clip</span>
          <span className="library-segment-chip">S split</span>
          <span className="library-segment-chip">←/→ nudge clip</span>
          <span className="library-segment-chip">Shift+←/→ nudge playhead</span>
        </div>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Revision history</h2>
          <span className="status-pill idle">{revisionHistory.length} revisions</span>
        </div>
        <button
          type="button"
          className="button ghost"
          onClick={() => void loadRevisionHistory()}
          disabled={revisionBusy}
        >
          {revisionBusy ? "Loading revisions…" : "Refresh revision history"}
        </button>
        <div className="calendar-library-list">
          {revisionHistory.length === 0 ? (
            <div className="empty-state">No saved revisions yet.</div>
          ) : null}
          {revisionHistory.map((revision) => (
            <div key={revision.id} className="calendar-library-card" style={{ textAlign: "left" }}>
              <strong>Revision #{revision.revision_number}</strong>
              <small>
                {revision.autosave ? "Autosave" : "Manual save"} •{" "}
                {new Date(revision.created_at).toLocaleString()}
              </small>
              {revision.comment ? <small>{revision.comment}</small> : null}
              <button
                type="button"
                className="button ghost"
                onClick={() => void restoreRevision(revision.id, revision.revision_number)}
                disabled={revisionBusy || revision.id === data.revision.id}
              >
                Restore revision
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Render settings</h2>
          <span className="status-pill idle">
            {state.snapshot.renderSettings.format}/{state.snapshot.renderSettings.codec}
          </span>
        </div>
        <label>
          Render quality
          <select
            value={renderSettingsDraft.quality}
            onChange={(event) =>
              setRenderSettingsDraft((draft) => ({
                ...draft,
                quality: event.target.value as EditorRenderSettings["quality"],
              }))
            }
          >
            <option value="draft">draft</option>
            <option value="standard">standard</option>
            <option value="high">high</option>
          </select>
        </label>
        <label>
          Frames per second
          <input
            type="number"
            min={1}
            max={120}
            value={renderSettingsDraft.fps}
            onChange={(event) =>
              setRenderSettingsDraft((draft) => ({ ...draft, fps: event.target.value }))
            }
          />
        </label>
        <label className="library-segment-chip">
          <input
            type="checkbox"
            checked={renderSettingsDraft.includeCaptions}
            onChange={(event) =>
              setRenderSettingsDraft((draft) => ({
                ...draft,
                includeCaptions: event.target.checked,
              }))
            }
          />
          Include captions
        </label>
        <small>
          Output {state.snapshot.renderSettings.width}×{state.snapshot.renderSettings.height} •{" "}
          {state.snapshot.renderSettings.audioCodec}
        </small>
        <button type="button" className="button ghost" onClick={applyRenderSettings}>
          Apply render settings
        </button>
      </section>

      <section className="panel stack">
        <div className="panel-title">
          <h2>Render draft</h2>
          <span className={`status-pill ${renderJob?.status === "succeeded" ? "good" : "idle"}`}>
            {renderJob?.status ?? "not rendered"}
          </span>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => void renderDraft()}
          disabled={rendering || !projectHealth.isValid}
        >
          <Wand2 size={14} /> {rendering ? "Rendering…" : "Mock render"}
        </button>
        {renderJob?.output_url ? (
          <a className="button ghost" href={renderJob.output_url}>
            Output: {renderJob.output_url}
          </a>
        ) : null}
        {renderJob?.status === "succeeded" ? (
          <>
            <label>
              audioClipId for Library handoff
              <input
                value={renderAudioClipId}
                placeholder="Optional when source project can infer it"
                onChange={(event) => setRenderAudioClipId(event.target.value)}
              />
            </label>
            <small>Auto-inferred for lyric-template/library-item projects when possible.</small>
            <div className="row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="button ghost"
                onClick={() => void addRenderToLibrary()}
                disabled={addingToLibrary}
              >
                {addingToLibrary ? "Adding…" : "Add to Library"}
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={scheduleRenderOutput}
                disabled={!renderJob.output_library_item_id}
              >
                Schedule in Studio
              </button>
            </div>
          </>
        ) : null}
      </section>

      {message ? <div className="status-pill idle">{message}</div> : null}
    </main>
  );
}
