import { handleOptions } from "../_shared/cors.ts";
import { errorEnvelope, okEnvelope } from "../_shared/envelope.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";

type RequestBody = {
  action?: "listProjectAssets" | "importMediaAsset" | "importLibraryItem" | "importSourceCandidate" | "deleteAsset";
  projectId?: string;
  mediaAssetId?: string;
  libraryItemId?: string;
  sourceCandidateId?: string;
  editorAssetId?: string;
  forceDelete?: boolean;
  name?: string;
};

function kindFromMime(mime?: string | null): string {
  if (!mime) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "video";
}

async function listProjectAssets(projectId: string) {
  const supabase = getSupabaseAdmin();
  const rows = await supabase
    .from("video_editor_assets")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (rows.error) throw rows.error;
  return { assets: rows.data ?? [] };
}


async function loadLatestProjectSnapshot(projectId: string) {
  const supabase = getSupabaseAdmin();
  const revision = await supabase
    .from("video_editor_revisions")
    .select("snapshot")
    .eq("project_id", projectId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (revision.error) throw revision.error;
  return revision.data?.snapshot as Record<string, unknown> | undefined;
}

function snapshotUsesAsset(snapshot: Record<string, unknown> | undefined, editorAssetId: string): boolean {
  const clips = Array.isArray(snapshot?.clips) ? snapshot.clips : [];
  return clips.some((clip) => {
    if (!clip || typeof clip !== "object") return false;
    return (clip as Record<string, unknown>).assetId === editorAssetId;
  });
}

async function importMediaAsset(body: RequestBody) {
  if (!body.projectId || !body.mediaAssetId) throw new Error("projectId and mediaAssetId are required.");
  const supabase = getSupabaseAdmin();
  const media = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", body.mediaAssetId)
    .single();
  if (media.error) throw Object.assign(media.error, { code: "EDITOR_ASSET_NOT_FOUND" });
  const kind = kindFromMime(media.data.mime_type) || media.data.kind;
  if (!["video", "image", "audio"].includes(kind)) {
    throw Object.assign(new Error("Unsupported media asset kind."), { code: "EDITOR_ASSET_UNSUPPORTED" });
  }
  const inserted = await supabase
    .from("video_editor_assets")
    .insert({
      project_id: body.projectId,
      media_asset_id: media.data.id,
      kind,
      name: body.name ?? media.data.file_name ?? media.data.kind ?? "Media asset",
      duration_ms: media.data.duration_sec ? Math.round(Number(media.data.duration_sec) * 1000) : null,
      width: media.data.width ?? media.data.metadata?.width ?? null,
      height: media.data.height ?? media.data.metadata?.height ?? null,
      public_url: media.data.public_url,
      storage_bucket: media.data.storage_bucket,
      storage_path: media.data.storage_path,
      thumbnail_url: media.data.metadata?.thumbnail_url ?? null,
      provenance: { type: "media_asset", media_asset_id: media.data.id },
      metadata: media.data.metadata ?? {},
    })
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;
  return { asset: inserted.data };
}

async function importLibraryItem(body: RequestBody) {
  if (!body.projectId || !body.libraryItemId) throw new Error("projectId and libraryItemId are required.");
  const supabase = getSupabaseAdmin();
  const item = await supabase
    .from("video_library_items")
    .select("*")
    .eq("id", body.libraryItemId)
    .single();
  if (item.error) throw Object.assign(item.error, { code: "EDITOR_ASSET_NOT_FOUND" });
  const inserted = await supabase
    .from("video_editor_assets")
    .insert({
      project_id: body.projectId,
      media_asset_id: item.data.final_asset_id,
      library_item_id: item.data.id,
      kind: "video",
      name: body.name ?? item.data.default_caption ?? `Library clip ${item.data.library_index + 1}`,
      duration_ms: Math.round(Number(item.data.duration_sec ?? 0) * 1000),
      thumbnail_url: item.data.thumbnail_url,
      provenance: { type: "library_item", library_item_id: item.data.id, provenance: item.data.provenance ?? [] },
      metadata: item.data.metadata ?? {},
    })
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;
  return { asset: inserted.data };
}

async function importSourceCandidate(body: RequestBody) {
  if (!body.projectId || !body.sourceCandidateId) throw new Error("projectId and sourceCandidateId are required.");
  const supabase = getSupabaseAdmin();
  const candidate = await supabase
    .from("source_candidates")
    .select("*")
    .eq("id", body.sourceCandidateId)
    .single();
  if (candidate.error) throw Object.assign(candidate.error, { code: "EDITOR_ASSET_NOT_FOUND" });
  const inserted = await supabase
    .from("video_editor_assets")
    .insert({
      project_id: body.projectId,
      source_candidate_id: candidate.data.id,
      kind: "video",
      name: body.name ?? `${candidate.data.provider}:${candidate.data.external_id ?? candidate.data.id}`,
      duration_ms: Math.round(Number(candidate.data.duration_seconds ?? 0) * 1000),
      width: candidate.data.width,
      height: candidate.data.height,
      public_url: candidate.data.cached_url ?? candidate.data.origin_url,
      storage_bucket: candidate.data.storage_bucket,
      storage_path: candidate.data.storage_path,
      provenance: { type: "source_candidate", source_candidate_id: candidate.data.id, provider: candidate.data.provider, license: candidate.data.license, attribution: candidate.data.attribution },
      metadata: candidate.data.metadata ?? {},
    })
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;
  return { asset: inserted.data };
}

async function deleteAsset(body: RequestBody) {
  if (!body.projectId || !body.editorAssetId) throw new Error("projectId and editorAssetId are required.");
  const supabase = getSupabaseAdmin();
  const asset = await supabase
    .from("video_editor_assets")
    .select("id,project_id")
    .eq("id", body.editorAssetId)
    .eq("project_id", body.projectId)
    .single();
  if (asset.error) throw Object.assign(asset.error, { code: "EDITOR_ASSET_NOT_FOUND" });

  const snapshot = await loadLatestProjectSnapshot(body.projectId);
  if (snapshotUsesAsset(snapshot, body.editorAssetId) && !body.forceDelete) {
    throw Object.assign(new Error("Editor asset is still used by timeline clips."), { code: "EDITOR_ASSET_IN_USE" });
  }

  const deleted = await supabase
    .from("video_editor_assets")
    .delete()
    .eq("id", body.editorAssetId)
    .eq("project_id", body.projectId)
    .select("id")
    .single();
  if (deleted.error) throw Object.assign(deleted.error, { code: "EDITOR_ASSET_NOT_FOUND" });
  return { deleted_id: deleted.data.id };
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return errorEnvelope("Method not allowed.", "METHOD_NOT_ALLOWED", 405);

  try {
    const body = (await request.json()) as RequestBody;
    switch (body.action) {
      case "listProjectAssets":
        if (!body.projectId) throw new Error("projectId is required.");
        return okEnvelope(await listProjectAssets(body.projectId));
      case "importMediaAsset":
        return okEnvelope(await importMediaAsset(body));
      case "importLibraryItem":
        return okEnvelope(await importLibraryItem(body));
      case "importSourceCandidate":
        return okEnvelope(await importSourceCandidate(body));
      case "deleteAsset":
        if (!body.editorAssetId) throw new Error("editorAssetId is required.");
        return okEnvelope(await deleteAsset(body));
      default:
        return errorEnvelope("Unknown video editor asset action.", "EDITOR_INVALID_ACTION", 400);
    }
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "VIDEO_EDITOR_ASSET_FAILED";
    return errorEnvelope(error, code, code.startsWith("EDITOR_") ? 400 : 500);
  }
});

