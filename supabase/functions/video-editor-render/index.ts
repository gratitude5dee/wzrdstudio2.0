import { handleOptions } from "../_shared/cors.ts";
import { errorEnvelope, okEnvelope } from "../_shared/envelope.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

type RenderProvider = "fal_ffmpeg" | "remotion" | "mock";
type RequestBody = {
  action?: "create" | "status" | "cancel" | "callback" | "addToLibrary";
  projectId?: string;
  revisionId?: string;
  renderJobId?: string;
  provider?: RenderProvider;
  renderSettings?: Record<string, unknown>;
  idempotencyKey?: string;
  status?: "queued" | "rendering" | "succeeded" | "failed" | "cancelled";
  progress?: number;
  output?: {
    storageBucket?: string;
    storagePath?: string;
    publicUrl?: string;
    durationMs?: number;
    width?: number;
    height?: number;
  };
  errorCode?: string;
  errorMessage?: string;
  accountId?: string;
  audioClipId?: string;
  defaultCaption?: string;
};

type NormalizedRenderSettings = {
  format: "mp4";
  codec: "h264";
  audioCodec: "aac";
  width: number;
  height: number;
  fps: number;
  includeCaptions: boolean;
  quality: "draft" | "standard" | "high";
  bitrate?: string;
};

function snapshotNumber(snapshot: Record<string, unknown>, path: string[], fallback: number): number {
  let cursor: unknown = snapshot;
  for (const key of path) {
    cursor = cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>)[key] : undefined;
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : fallback;
}

function validateEditorSnapshot(snapshot: unknown): void {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    throw Object.assign(new Error("Snapshot must be an object."), { code: "EDITOR_INVALID_SNAPSHOT" });
  }
  const record = snapshot as Record<string, unknown>;
  const project = record.project as Record<string, unknown> | undefined;
  const renderSettings = record.renderSettings as Record<string, unknown> | undefined;
  if (record.schemaVersion !== 1 || !project || !Array.isArray(record.tracks) || !Array.isArray(record.clips) || !renderSettings) {
    throw Object.assign(new Error("Editor snapshot is invalid."), { code: "EDITOR_INVALID_SNAPSHOT" });
  }
  if (renderSettings.width !== project.width || renderSettings.height !== project.height) {
    throw Object.assign(new Error("Render settings dimensions must match project dimensions."), { code: "EDITOR_INVALID_SNAPSHOT" });
  }
}

function normalizeRenderSettings(
  input: Record<string, unknown> | undefined,
  snapshot: Record<string, unknown>,
): NormalizedRenderSettings {
  const source = input ?? {};
  const projectWidth = snapshotNumber(snapshot, ["project", "width"], 1080);
  const projectHeight = snapshotNumber(snapshot, ["project", "height"], 1920);
  const projectFps = snapshotNumber(snapshot, ["project", "fps"], 30);
  const width = Math.max(16, Math.min(7680, Math.round(Number(source.width ?? projectWidth))));
  const height = Math.max(16, Math.min(7680, Math.round(Number(source.height ?? projectHeight))));
  const fps = Math.max(1, Math.min(120, Math.round(Number(source.fps ?? projectFps))));
  const quality = source.quality === "draft" || source.quality === "standard" || source.quality === "high" ? source.quality : "standard";
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(fps)) {
    throw Object.assign(new Error("Render settings are invalid."), { code: "EDITOR_RENDER_SETTINGS_INVALID" });
  }
  return {
    format: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width,
    height,
    fps,
    includeCaptions: typeof source.includeCaptions === "boolean" ? source.includeCaptions : true,
    quality,
    ...(typeof source.bitrate === "string" && source.bitrate.trim() ? { bitrate: source.bitrate.trim() } : {}),
  };
}

async function loadRevision(projectId: string, revisionId?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("video_editor_revisions").select("*").eq("project_id", projectId);
  if (revisionId) query = query.eq("id", revisionId);
  const revision = await query.order("revision_number", { ascending: false }).limit(1).single();
  if (revision.error) throw revision.error;
  return revision.data;
}

async function getRenderJob(renderJobId: string) {
  const supabase = getSupabaseAdmin();
  const job = await supabase.from("video_editor_render_jobs").select("*").eq("id", renderJobId).single();
  if (job.error) throw Object.assign(job.error, { code: "EDITOR_RENDER_JOB_NOT_FOUND" });
  return { render_job: job.data };
}

async function createRenderJob(body: RequestBody) {
  if (!body.projectId) throw new Error("projectId is required.");
  const provider = body.provider ?? "mock";
  if (provider !== "mock" && provider !== "fal_ffmpeg" && provider !== "remotion") {
    throw Object.assign(new Error("Unsupported render provider."), { code: "EDITOR_RENDER_PROVIDER_UNAVAILABLE" });
  }
  const supabase = getSupabaseAdmin();
  const revision = await loadRevision(body.projectId, body.revisionId);
  validateEditorSnapshot(revision.snapshot);
  const renderSettings = normalizeRenderSettings(body.renderSettings, revision.snapshot);
  const insert = await supabase
    .from("video_editor_render_jobs")
    .insert({
      project_id: body.projectId,
      revision_id: revision.id,
      status: provider === "mock" ? "succeeded" : "queued",
      provider,
      progress: provider === "mock" ? 1 : 0,
      output_url: provider === "mock" ? `mock://worldstudio-render/${crypto.randomUUID()}.mp4` : null,
      render_settings: renderSettings,
      idempotency_key: body.idempotencyKey ?? crypto.randomUUID(),
      started_at: new Date().toISOString(),
      finished_at: provider === "mock" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();
  if (insert.error) throw insert.error;

  if (provider === "mock") {
    const media = await supabase
      .from("media_assets")
      .insert({
        account_id: null,
        kind: "rendered_video",
        source: "worldstudio_editor_mock",
        public_url: insert.data.output_url,
        mime_type: "video/mp4",
        metadata: {
          worldstudio_project_id: body.projectId,
          worldstudio_revision_id: revision.id,
          render_job_id: insert.data.id,
        },
      })
      .select("id,public_url")
      .maybeSingle();
    if (!media.error && media.data?.id) {
      const updated = await supabase
        .from("video_editor_render_jobs")
        .update({ output_asset_id: media.data.id, updated_at: new Date().toISOString() })
        .eq("id", insert.data.id)
        .select("*")
        .single();
      if (updated.error) throw updated.error;
      return { render_job: updated.data, revision };
    }
  }
  return { render_job: insert.data, revision };
}

async function cancelRenderJob(renderJobId: string) {
  const supabase = getSupabaseAdmin();
  const job = await supabase
    .from("video_editor_render_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", renderJobId)
    .select("*")
    .single();
  if (job.error) throw Object.assign(job.error, { code: "EDITOR_RENDER_JOB_NOT_FOUND" });
  return { render_job: job.data };
}

async function inferLibraryHandoffContext(project: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  if (project.source_type === "lyric_template" && project.source_id) {
    const template = await supabase
      .from("kanvas_lyric_templates")
      .select("audio_clip_id")
      .eq("id", String(project.source_id))
      .maybeSingle();
    if (template.error) throw template.error;
    return { accountId: project.account_id as string | undefined, audioClipId: template.data?.audio_clip_id as string | undefined };
  }
  if (project.source_type === "library_item" && project.source_id) {
    const libraryItem = await supabase
      .from("video_library_items")
      .select("account_id,audio_clip_id")
      .eq("id", String(project.source_id))
      .maybeSingle();
    if (libraryItem.error) throw libraryItem.error;
    return {
      accountId: libraryItem.data?.account_id as string | undefined,
      audioClipId: libraryItem.data?.audio_clip_id as string | undefined,
    };
  }
  return { accountId: project.account_id as string | undefined, audioClipId: undefined };
}

async function addRenderToLibrary(body: RequestBody) {
  if (!body.renderJobId) throw new Error("renderJobId is required.");
  const supabase = getSupabaseAdmin();
  const jobResult = await supabase.from("video_editor_render_jobs").select("*").eq("id", body.renderJobId).single();
  if (jobResult.error) throw Object.assign(jobResult.error, { code: "EDITOR_RENDER_JOB_NOT_FOUND" });
  const job = jobResult.data;
  if (job.status !== "succeeded") {
    throw Object.assign(new Error("Render job must succeed before adding to Library."), { code: "EDITOR_RENDER_NOT_SUCCEEDED" });
  }
  if (!job.output_asset_id) {
    throw Object.assign(new Error("Render job is missing an output media asset."), { code: "EDITOR_RENDER_OUTPUT_ASSET_REQUIRED" });
  }
  if (job.output_library_item_id) return { render_job: job };

  const projectResult = await supabase.from("video_editor_projects").select("*").eq("id", job.project_id).single();
  if (projectResult.error) throw projectResult.error;
  const project = projectResult.data;
  const inferred = await inferLibraryHandoffContext(project);
  const accountId = body.accountId ?? inferred.accountId;
  const audioClipId = body.audioClipId ?? inferred.audioClipId;
  if (!accountId || !audioClipId) {
    throw Object.assign(new Error("accountId and audioClipId are required to add editor render to Library."), { code: "EDITOR_LIBRARY_AUDIO_CLIP_REQUIRED" });
  }

  const existingRows = await supabase
    .from("video_library_items")
    .select("library_index")
    .eq("audio_clip_id", audioClipId)
    .order("library_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRows.error) throw existingRows.error;
  const libraryIndex = Number(existingRows.data?.library_index ?? -1) + 1;
  const durationSec = Math.max(1, Math.round(Number(project.duration_ms ?? 15000) / 1000));
  const libraryItem = await supabase
    .from("video_library_items")
    .insert({
      account_id: accountId,
      audio_clip_id: audioClipId,
      final_asset_id: job.output_asset_id,
      duration_sec: durationSec,
      library_index: libraryIndex,
      status: "ready",
      default_caption: body.defaultCaption ?? project.title ?? "WorldStudio edit",
      default_hashtags: ["#fanagent", "#worldstudio"],
      segments: [],
      metadata: {
        source: "worldstudio_editor",
        worldstudio_project_id: job.project_id,
        worldstudio_revision_id: job.revision_id,
        worldstudio_render_job_id: job.id,
        output_url: job.output_url,
      },
      provenance: { source: "worldstudio_editor", render_job_id: job.id },
      reused_flags: {},
    })
    .select("*")
    .single();
  if (libraryItem.error) throw libraryItem.error;

  const updated = await supabase
    .from("video_editor_render_jobs")
    .update({ output_library_item_id: libraryItem.data.id, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .select("*")
    .single();
  if (updated.error) throw updated.error;
  return { render_job: updated.data, library_item: libraryItem.data };
}

async function callbackRenderJob(body: RequestBody) {
  if (!body.renderJobId) throw new Error("renderJobId is required.");
  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = {
    status: body.status ?? "rendering",
    progress: body.progress ?? 0,
    output_url: body.output?.publicUrl,
    error_code: body.errorCode,
    error_message: body.errorMessage,
    updated_at: new Date().toISOString(),
  };
  if (body.status === "succeeded" || body.status === "failed" || body.status === "cancelled") {
    update.finished_at = new Date().toISOString();
  }
  const job = await supabase
    .from("video_editor_render_jobs")
    .update(update)
    .eq("id", body.renderJobId)
    .select("*")
    .single();
  if (job.error) throw Object.assign(job.error, { code: "EDITOR_RENDER_JOB_NOT_FOUND" });
  return { render_job: job.data };
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return errorEnvelope("Method not allowed.", "METHOD_NOT_ALLOWED", 405);

  try {
    const body = (await request.json()) as RequestBody;
    switch (body.action) {
      case "create":
        return okEnvelope(await createRenderJob(body));
      case "status":
        if (!body.renderJobId) throw new Error("renderJobId is required.");
        return okEnvelope(await getRenderJob(body.renderJobId));
      case "cancel":
        if (!body.renderJobId) throw new Error("renderJobId is required.");
        return okEnvelope(await cancelRenderJob(body.renderJobId));
      case "callback":
        return okEnvelope(await callbackRenderJob(body));
      case "addToLibrary":
        return okEnvelope(await addRenderToLibrary(body));
      default:
        return errorEnvelope("Unknown video editor render action.", "EDITOR_INVALID_ACTION", 400);
    }
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "VIDEO_EDITOR_RENDER_FAILED";
    return errorEnvelope(error, code, code.startsWith("EDITOR_") ? 400 : 500);
  }
});

