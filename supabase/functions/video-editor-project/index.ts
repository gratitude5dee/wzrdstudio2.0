import { handleOptions } from "../_shared/cors.ts";
import { errorEnvelope, okEnvelope } from "../_shared/envelope.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

type EditorAspectRatio = "9:16" | "1:1" | "16:9";
type RequestBody = {
  action?:
    | "createBlank"
    | "createFromLyricTemplate"
    | "createFromLibraryItem"
    | "duplicate"
    | "get"
    | "saveRevision"
    | "listRevisions"
    | "restoreRevision"
    | "updateProject";
  projectId?: string;
  revisionId?: string;
  templateId?: string;
  libraryItemId?: string;
  accountId?: string | null;
  title?: string;
  aspectRatio?: EditorAspectRatio;
  durationMs?: number;
  snapshot?: Record<string, unknown>;
  autosave?: boolean;
  clientId?: string;
  comment?: string;
  openExisting?: boolean;
};

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

function dimensionsForAspectRatio(aspectRatio: EditorAspectRatio) {
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

function buildSnapshot(input: {
  projectId: string;
  title: string;
  aspectRatio?: EditorAspectRatio;
  durationMs?: number;
}): Record<string, unknown> {
  const aspectRatio = input.aspectRatio ?? "9:16";
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const durationMs = input.durationMs ?? 15000;
  return {
    schemaVersion: 1,
    project: {
      id: input.projectId,
      title: input.title,
      aspectRatio,
      width: dimensions.width,
      height: dimensions.height,
      fps: 30,
      durationMs,
      background: "#000000",
    },
    tracks: [
      { id: "audio-track", name: "Audio", kind: "audio", order: 0, locked: false, muted: false, hidden: false },
      { id: "video-track", name: "Video", kind: "video", order: 1, locked: false, muted: false, hidden: false },
      { id: "lyrics-track", name: "Lyrics", kind: "lyrics", order: 2, locked: false, muted: false, hidden: false },
      { id: "markers-track", name: "Markers", kind: "markers", order: 3, locked: false, muted: false, hidden: false },
    ],
    clips: [],
    assets: [],
    markers: [],
    renderSettings: {
      format: "mp4",
      codec: "h264",
      audioCodec: "aac",
      width: dimensions.width,
      height: dimensions.height,
      fps: 30,
      includeCaptions: true,
      quality: "standard",
    },
  };
}

function failInvalidSnapshot(message: string): never {
  throw Object.assign(new Error(message), { code: "EDITOR_INVALID_SNAPSHOT" });
}

function asRecord(value: unknown, message = "Editor snapshot is invalid."): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) failInvalidSnapshot(message);
  return value as Record<string, unknown>;
}

function assertUniqueIds(items: Record<string, unknown>[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const id = item.id;
    if (typeof id !== "string" || !id || ids.has(id)) failInvalidSnapshot(`Duplicate ${label} id detected.`);
    ids.add(id);
  }
  return ids;
}

function assertUniqueNumbers(values: unknown[], label: string): void {
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isInteger(value as number) || seen.has(value as number)) failInvalidSnapshot(`Duplicate ${label} detected.`);
    seen.add(value as number);
  }
}

function validateEditorSnapshot(snapshot: unknown): void {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    throw Object.assign(new Error("Snapshot must be an object."), { code: "EDITOR_INVALID_SNAPSHOT" });
  }
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) {
    throw Object.assign(new Error("Editor snapshot is too large."), { code: "EDITOR_SNAPSHOT_TOO_LARGE" });
  }
  const record = snapshot as Record<string, unknown>;
  if (record.schemaVersion !== 1 || !record.project || !Array.isArray(record.tracks) || !Array.isArray(record.clips)) {
    throw Object.assign(new Error("Editor snapshot is invalid."), { code: "EDITOR_INVALID_SNAPSHOT" });
  }
  const project = asRecord(record.project);
  const durationMs = project.durationMs;
  if (typeof durationMs !== "number" || durationMs <= 0 || durationMs > 600000) failInvalidSnapshot("Project duration must be > 0 and <= 600000ms.");
  const tracks = (record.tracks as unknown[]).map((item) => asRecord(item));
  const clips = (record.clips as unknown[]).map((item) => asRecord(item));
  const assets = Array.isArray(record.assets) ? record.assets.map((item) => asRecord(item)) : [];
  const markers = Array.isArray(record.markers) ? record.markers.map((item) => asRecord(item)) : [];
  const trackIds = assertUniqueIds(tracks, "track");
  const assetIds = assertUniqueIds(assets, "asset");
  assertUniqueIds(clips, "clip");
  assertUniqueIds(markers, "marker");
  assertUniqueNumbers(tracks.map((track) => track.order), "track order");
  for (const track of tracks) {
    if (typeof track.locked !== "boolean" || typeof track.muted !== "boolean" || typeof track.hidden !== "boolean") {
      failInvalidSnapshot("Track locked/muted/hidden must be booleans.");
    }
  }
  for (const clip of clips) {
    if (!trackIds.has(String(clip.trackId))) failInvalidSnapshot("Every clip must reference an existing track.");
    if (clip.assetId && !assetIds.has(String(clip.assetId))) failInvalidSnapshot("Every clip assetId must reference an existing asset.");
    if (typeof clip.startMs !== "number" || clip.startMs < 0) failInvalidSnapshot("Clip startMs must be non-negative.");
    if (typeof clip.durationMs !== "number" || clip.durationMs < 100) failInvalidSnapshot("Clip durationMs must be at least 100ms.");
    if (typeof clip.sourceStartMs !== "number" || clip.sourceStartMs < 0) failInvalidSnapshot("Clip sourceStartMs must be non-negative.");
    if (clip.startMs + clip.durationMs > durationMs + 1000) failInvalidSnapshot("Clip timing exceeds project duration.");
  }
  for (const marker of markers) {
    if (typeof marker.timeMs !== "number" || marker.timeMs < 0 || marker.timeMs > durationMs) failInvalidSnapshot("Marker time must be within project duration.");
  }
  const renderSettings = asRecord(record.renderSettings);
  if (renderSettings.width !== project.width || renderSettings.height !== project.height) {
    failInvalidSnapshot("Render settings dimensions must match project dimensions.");
  }
}

function cloneEditorSnapshotForProject(snapshot: Record<string, unknown>, projectId: string, title: string): Record<string, unknown> {
  const cloned = structuredClone(snapshot) as Record<string, unknown>;
  const project = typeof cloned.project === "object" && cloned.project !== null ? cloned.project as Record<string, unknown> : {};
  cloned.project = { ...project, id: projectId, title };
  validateEditorSnapshot(cloned);
  return cloned;
}

async function nextRevisionNumber(projectId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const current = await supabase
    .from("video_editor_revisions")
    .select("revision_number")
    .eq("project_id", projectId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (current.error) throw current.error;
  return Number(current.data?.revision_number ?? 0) + 1;
}

async function createProject(input: {
  accountId?: string | null;
  title: string;
  sourceType: string;
  sourceId?: string | null;
  aspectRatio?: EditorAspectRatio;
  durationMs?: number;
}) {
  const supabase = getSupabaseAdmin();
  const projectId = crypto.randomUUID();
  const aspectRatio = input.aspectRatio ?? "9:16";
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const snapshot = buildSnapshot({ projectId, title: input.title, aspectRatio, durationMs: input.durationMs });
  validateEditorSnapshot(snapshot);

  const project = await supabase
    .from("video_editor_projects")
    .insert({
      id: projectId,
      account_id: input.accountId ?? null,
      title: input.title,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      aspect_ratio: aspectRatio,
      width: dimensions.width,
      height: dimensions.height,
      duration_ms: input.durationMs ?? 15000,
      status: "draft",
    })
    .select("*")
    .single();
  if (project.error) throw project.error;

  const revision = await supabase
    .from("video_editor_revisions")
    .insert({ project_id: projectId, revision_number: 1, snapshot, autosave: false, comment: "Initial revision" })
    .select("*")
    .single();
  if (revision.error) throw revision.error;

  const updated = await supabase
    .from("video_editor_projects")
    .update({ current_revision_id: revision.data.id, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("*")
    .single();
  if (updated.error) throw updated.error;
  return { project: updated.data, revision: revision.data, snapshot };
}

async function duplicateProject(body: RequestBody) {
  if (!body.projectId) throw new Error("projectId is required.");
  const supabase = getSupabaseAdmin();
  const source = await getProject(body.projectId);
  const sourceProject = source.project as Record<string, unknown>;
  const sourceSnapshot = source.snapshot as Record<string, unknown>;
  const projectId = crypto.randomUUID();
  const title = body.title ?? `${String(sourceProject.title ?? "Editor project")} remix`;
  const aspectRatio = (sourceProject.aspect_ratio as EditorAspectRatio | undefined) ?? "9:16";
  const dimensions = dimensionsForAspectRatio(aspectRatio);
  const durationMs = Number(sourceProject.duration_ms ?? ((sourceSnapshot.project as Record<string, unknown> | undefined)?.durationMs ?? 15000));
  const snapshot = cloneEditorSnapshotForProject(sourceSnapshot, projectId, title);
  // API contract parity with createProject input: sourceType: "editor_project".

  const project = await supabase
    .from("video_editor_projects")
    .insert({
      id: projectId,
      account_id: body.accountId ?? sourceProject.account_id ?? null,
      title,
      source_type: "editor_project",
      source_id: body.projectId,
      aspect_ratio: aspectRatio,
      width: Number(sourceProject.width ?? dimensions.width),
      height: Number(sourceProject.height ?? dimensions.height),
      duration_ms: durationMs,
      status: "draft",
    })
    .select("*")
    .single();
  if (project.error) throw project.error;

  const revision = await supabase
    .from("video_editor_revisions")
    .insert({ project_id: projectId, revision_number: 1, snapshot, autosave: false, comment: "Duplicated from editor project" })
    .select("*")
    .single();
  if (revision.error) throw revision.error;

  const sourceAssets = await supabase.from("video_editor_assets").select("*").eq("project_id", body.projectId);
  if (sourceAssets.error) throw sourceAssets.error;
  if ((sourceAssets.data ?? []).length > 0) {
    const assetRows = (sourceAssets.data ?? []).map(({ id: _id, project_id: _projectId, created_at: _createdAt, updated_at: _updatedAt, ...asset }) => ({
      ...asset,
      project_id: projectId,
    }));
    const insertedAssets = await supabase.from("video_editor_assets").insert(assetRows).select("*");
    if (insertedAssets.error) throw insertedAssets.error;
  }

  const updated = await supabase
    .from("video_editor_projects")
    .update({ current_revision_id: revision.data.id, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("*")
    .single();
  if (updated.error) throw updated.error;
  return { project: updated.data, revision: revision.data, snapshot };
}

async function getProject(projectId: string) {
  const supabase = getSupabaseAdmin();
  const project = await supabase.from("video_editor_projects").select("*").eq("id", projectId).single();
  if (project.error) throw project.error;
  const currentRevisionId = project.data.current_revision_id;
  const revision = currentRevisionId
    ? await supabase.from("video_editor_revisions").select("*").eq("id", currentRevisionId).eq("project_id", projectId).single()
    : await supabase
      .from("video_editor_revisions")
      .select("*")
      .eq("project_id", projectId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .single();
  if (revision.error) throw revision.error;
  const assets = await supabase.from("video_editor_assets").select("*").eq("project_id", projectId);
  if (assets.error) throw assets.error;
  return { project: project.data, revision: revision.data, snapshot: revision.data.snapshot, assets: assets.data ?? [] };
}

async function listRevisions(body: RequestBody) {
  if (!body.projectId) throw new Error("projectId is required.");
  const supabase = getSupabaseAdmin();
  const revisions = await supabase
    .from("video_editor_revisions")
    .select("id, project_id, revision_number, snapshot, autosave, comment, created_at")
    .eq("project_id", body.projectId)
    .order("revision_number", { ascending: false })
    .limit(50);
  if (revisions.error) throw revisions.error;
  return { revisions: revisions.data ?? [] };
}

async function restoreRevision(body: RequestBody) {
  if (!body.projectId) throw new Error("projectId is required.");
  if (!body.revisionId) throw new Error("revisionId is required.");
  const supabase = getSupabaseAdmin();
  const target = await supabase
    .from("video_editor_revisions")
    .select("*")
    .eq("project_id", body.projectId)
    .eq("id", body.revisionId)
    .single();
  if (target.error) throw target.error;
  validateEditorSnapshot(target.data.snapshot);

  const revisionNumber = await nextRevisionNumber(body.projectId);
  const restoredRevision = await supabase
    .from("video_editor_revisions")
    .insert({
      project_id: body.projectId,
      revision_number: revisionNumber,
      snapshot: target.data.snapshot,
      autosave: false,
      comment: `Restored from revision #${target.data.revision_number}`,
      created_by_client_id: body.clientId ?? null,
    })
    .select("*")
    .single();
  if (restoredRevision.error) throw restoredRevision.error;

  const projectPayload = (target.data.snapshot.project ?? {}) as Record<string, unknown>;
  const project = await supabase
    .from("video_editor_projects")
    .update({
      current_revision_id: restoredRevision.data.id,
      title: typeof projectPayload.title === "string" ? projectPayload.title : undefined,
      aspect_ratio: typeof projectPayload.aspectRatio === "string" ? projectPayload.aspectRatio : undefined,
      width: typeof projectPayload.width === "number" ? projectPayload.width : undefined,
      height: typeof projectPayload.height === "number" ? projectPayload.height : undefined,
      duration_ms: typeof projectPayload.durationMs === "number" ? projectPayload.durationMs : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.projectId)
    .select("*")
    .single();
  if (project.error) throw project.error;
  return { project: project.data, revision: restoredRevision.data, snapshot: restoredRevision.data.snapshot };
}

async function saveRevision(body: RequestBody) {
  if (!body.projectId) throw new Error("projectId is required.");
  if (!body.snapshot) throw Object.assign(new Error("snapshot is required."), { code: "EDITOR_INVALID_SNAPSHOT" });
  validateEditorSnapshot(body.snapshot);
  const supabase = getSupabaseAdmin();
  const revisionNumber = await nextRevisionNumber(body.projectId);
  const revision = await supabase
    .from("video_editor_revisions")
    .insert({
      project_id: body.projectId,
      revision_number: revisionNumber,
      snapshot: body.snapshot,
      autosave: body.autosave ?? true,
      comment: body.comment ?? null,
      created_by_client_id: body.clientId ?? null,
    })
    .select("*")
    .single();
  if (revision.error) throw revision.error;
  const projectPayload = (body.snapshot.project ?? {}) as Record<string, unknown>;
  const project = await supabase
    .from("video_editor_projects")
    .update({
      current_revision_id: revision.data.id,
      title: typeof projectPayload.title === "string" ? projectPayload.title : undefined,
      aspect_ratio: typeof projectPayload.aspectRatio === "string" ? projectPayload.aspectRatio : undefined,
      width: typeof projectPayload.width === "number" ? projectPayload.width : undefined,
      height: typeof projectPayload.height === "number" ? projectPayload.height : undefined,
      duration_ms: typeof projectPayload.durationMs === "number" ? projectPayload.durationMs : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.projectId)
    .select("*")
    .single();
  if (project.error) throw project.error;
  return { project: project.data, revision: revision.data, snapshot: revision.data.snapshot };
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return errorEnvelope("Method not allowed.", "METHOD_NOT_ALLOWED", 405);

  try {
    const body = (await request.json()) as RequestBody;
    switch (body.action) {
      case "createBlank":
        return okEnvelope(await createProject({ accountId: body.accountId, title: body.title ?? "Untitled edit", sourceType: "blank", aspectRatio: body.aspectRatio, durationMs: body.durationMs }));
      case "createFromLyricTemplate":
        if (!body.templateId) throw new Error("templateId is required.");
        return okEnvelope(await createProject({ accountId: body.accountId, title: body.title ?? "Lyric template edit", sourceType: "lyric_template", sourceId: body.templateId, aspectRatio: body.aspectRatio, durationMs: body.durationMs }));
      case "createFromLibraryItem":
        if (!body.libraryItemId) throw new Error("libraryItemId is required.");
        return okEnvelope(await createProject({ accountId: body.accountId, title: body.title ?? "Library item edit", sourceType: "library_item", sourceId: body.libraryItemId, aspectRatio: body.aspectRatio, durationMs: body.durationMs }));
      case "duplicate":
        if (!body.projectId) throw new Error("projectId is required.");
        return okEnvelope(await duplicateProject(body));
      case "get":
        if (!body.projectId) throw new Error("projectId is required.");
        return okEnvelope(await getProject(body.projectId));
      case "saveRevision":
        return okEnvelope(await saveRevision(body));
      case "listRevisions":
        return okEnvelope(await listRevisions(body));
      case "restoreRevision":
        return okEnvelope(await restoreRevision(body));
      case "updateProject":
        if (!body.projectId) throw new Error("projectId is required.");
        return okEnvelope(await getProject(body.projectId));
      default:
        return errorEnvelope("Unknown video editor project action.", "EDITOR_INVALID_ACTION", 400);
    }
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "VIDEO_EDITOR_PROJECT_FAILED";
    return errorEnvelope(error, code, code.startsWith("EDITOR_") ? 400 : 500);
  }
});



