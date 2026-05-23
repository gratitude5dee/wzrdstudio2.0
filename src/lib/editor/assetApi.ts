import { invokeEdgeFunction } from "@/lib/fanagent/invokeFunction";

export type EditorAssetRecord = {
  id: string;
  project_id: string;
  media_asset_id: string | null;
  project_asset_id: string | null;
  library_item_id: string | null;
  source_candidate_id: string | null;
  kind: "video" | "image" | "audio" | "text" | "lyrics" | "subtitle" | "shape" | "effect";
  name: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  public_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  thumbnail_url: string | null;
  provenance: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EditorAssetListResponse = { assets: EditorAssetRecord[] };
export type EditorAssetResponse = { asset: EditorAssetRecord };
export type EditorAssetDeleteResponse = { deleted_id: string };

export function listEditorAssets(projectId: string): Promise<EditorAssetListResponse> {
  return invokeEdgeFunction<EditorAssetListResponse>("video-editor-asset", {
    action: "listProjectAssets",
    projectId,
  });
}

export function importEditorMediaAsset(input: {
  projectId: string;
  mediaAssetId: string;
  name?: string;
}): Promise<EditorAssetResponse> {
  return invokeEdgeFunction<EditorAssetResponse>("video-editor-asset", {
    action: "importMediaAsset",
    ...input,
  });
}

export function importEditorLibraryItem(input: {
  projectId: string;
  libraryItemId: string;
  name?: string;
}): Promise<EditorAssetResponse> {
  return invokeEdgeFunction<EditorAssetResponse>("video-editor-asset", {
    action: "importLibraryItem",
    ...input,
  });
}

export function importEditorSourceCandidate(input: {
  projectId: string;
  sourceCandidateId: string;
  name?: string;
}): Promise<EditorAssetResponse> {
  return invokeEdgeFunction<EditorAssetResponse>("video-editor-asset", {
    action: "importSourceCandidate",
    ...input,
  });
}

export function deleteEditorAsset(input: {
  projectId: string;
  editorAssetId: string;
  forceDelete?: boolean;
}): Promise<EditorAssetDeleteResponse> {
  return invokeEdgeFunction<EditorAssetDeleteResponse>("video-editor-asset", {
    action: "deleteAsset",
    ...input,
  });
}

