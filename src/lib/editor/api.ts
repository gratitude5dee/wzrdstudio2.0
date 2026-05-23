import { invokeEdgeFunction } from "@/lib/fanagent/invokeFunction";
import type { EditorAspectRatio, EditorProjectSnapshot } from "./schema";

export type EditorProjectRecord = {
  id: string;
  account_id: string | null;
  title: string;
  source_type: string;
  source_id: string | null;
  aspect_ratio: EditorAspectRatio;
  width: number;
  height: number;
  fps: number;
  duration_ms: number;
  status: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EditorRevisionRecord = {
  id: string;
  project_id: string;
  revision_number: number;
  snapshot: EditorProjectSnapshot;
  autosave: boolean;
  comment: string | null;
  created_at: string;
};

export type EditorProjectResponse = {
  project: EditorProjectRecord;
  revision: EditorRevisionRecord;
  snapshot: EditorProjectSnapshot;
  assets?: unknown[];
};

export type EditorRevisionListResponse = {
  revisions: EditorRevisionRecord[];
};

export function createBlankEditorProject(input: {
  accountId?: string | null;
  title?: string;
  aspectRatio?: EditorAspectRatio;
  durationMs?: number;
} = {}): Promise<EditorProjectResponse> {
  return invokeEdgeFunction<EditorProjectResponse>("video-editor-project", {
    action: "createBlank",
    ...input,
  });
}

export function createEditorProjectFromLyricTemplate(input: {
  templateId: string;
  accountId?: string | null;
  title?: string;
  openExisting?: boolean;
}): Promise<EditorProjectResponse> {
  return invokeEdgeFunction<EditorProjectResponse>("video-editor-project", {
    action: "createFromLyricTemplate",
    ...input,
  });
}

export function createEditorProjectFromLibraryItem(input: {
  libraryItemId: string;
  accountId?: string | null;
  title?: string;
  openExisting?: boolean;
}): Promise<EditorProjectResponse> {
  return invokeEdgeFunction<EditorProjectResponse>("video-editor-project", {
    action: "createFromLibraryItem",
    ...input,
  });
}

export function getEditorProject(projectId: string): Promise<EditorProjectResponse> {
  return invokeEdgeFunction<EditorProjectResponse>("video-editor-project", {
    action: "get",
    projectId,
  });
}

export function saveEditorRevision(input: {
  projectId: string;
  snapshot: EditorProjectSnapshot;
  autosave?: boolean;
  clientId?: string;
  baseRevisionNumber?: number;
  comment?: string;
}): Promise<EditorProjectResponse> {
  return invokeEdgeFunction<EditorProjectResponse>("video-editor-project", {
    action: "saveRevision",
    ...input,
  });
}

export function listEditorRevisions(projectId: string): Promise<EditorRevisionListResponse> {
  return invokeEdgeFunction<EditorRevisionListResponse>("video-editor-project", {
    action: "listRevisions",
    projectId,
  });
}

export function restoreEditorRevision(input: {
  projectId: string;
  revisionId: string;
  clientId?: string;
}): Promise<EditorProjectResponse> {
  return invokeEdgeFunction<EditorProjectResponse>("video-editor-project", {
    action: "restoreRevision",
    ...input,
  });
}

export function duplicateEditorProject(input: {
  projectId: string;
  accountId?: string | null;
  title?: string;
}): Promise<EditorProjectResponse> {
  return invokeEdgeFunction<EditorProjectResponse>("video-editor-project", {
    action: "duplicate",
    ...input,
  });
}


