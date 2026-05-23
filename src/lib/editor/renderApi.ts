import { invokeEdgeFunction } from "@/lib/fanagent/invokeFunction";

export type EditorRenderJob = {
  id: string;
  project_id: string;
  revision_id: string;
  status: "queued" | "rendering" | "succeeded" | "failed" | "cancelled";
  provider: "fal_ffmpeg" | "remotion" | "mock";
  progress: number;
  output_asset_id: string | null;
  output_library_item_id: string | null;
  output_url: string | null;
  error_code: string | null;
  error_message: string | null;
  render_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EditorRenderResponse = {
  render_job: EditorRenderJob;
  revision?: unknown;
};

export function createEditorRenderJob(input: {
  projectId: string;
  revisionId?: string;
  provider?: "fal_ffmpeg" | "remotion" | "mock";
  renderSettings?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<EditorRenderResponse> {
  return invokeEdgeFunction<EditorRenderResponse>("video-editor-render", {
    action: "create",
    ...input,
  });
}

export function getEditorRenderJob(renderJobId: string): Promise<EditorRenderResponse> {
  return invokeEdgeFunction<EditorRenderResponse>("video-editor-render", {
    action: "status",
    renderJobId,
  });
}

export function cancelEditorRenderJob(renderJobId: string): Promise<EditorRenderResponse> {
  return invokeEdgeFunction<EditorRenderResponse>("video-editor-render", {
    action: "cancel",
    renderJobId,
  });
}


export function addEditorRenderToLibrary(input: {
  renderJobId: string;
  accountId?: string;
  audioClipId?: string;
  defaultCaption?: string;
}): Promise<EditorRenderResponse & { library_item?: unknown }> {
  return invokeEdgeFunction<EditorRenderResponse & { library_item?: unknown }>("video-editor-render", {
    action: "addToLibrary",
    ...input,
  });
}
