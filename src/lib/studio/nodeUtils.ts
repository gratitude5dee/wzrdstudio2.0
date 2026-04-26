import type { NodeDefinition } from '@/types/computeFlow';
import {
  getDefaultImageModel,
  getDefaultTextModel,
  getDefaultVideoModel,
  getModelById,
  type StudioModelMediaType,
} from '@/lib/studio-model-constants';

export interface NodeModelSelection {
  auto: boolean;
  selectedModelIds: string[];
  useMultipleModels: boolean;
}

export function getStudioNodeMediaType(
  kind: NodeDefinition['kind'] | string
): StudioModelMediaType | null {
  if (kind === 'Text' || kind === 'Prompt') {
    return 'text';
  }
  if (kind === 'Image' || kind === 'ImageEdit') {
    return 'image';
  }
  if (kind === 'Video') {
    return 'video';
  }
  return null;
}

export function getDefaultModelForNodeKind(
  kind: NodeDefinition['kind'] | string
): string {
  const mediaType = getStudioNodeMediaType(kind);
  if (mediaType === 'text') {
    return getDefaultTextModel();
  }
  if (mediaType === 'video') {
    return getDefaultVideoModel();
  }
  return getDefaultImageModel();
}

export function getNodePromptValue(
  node?: Pick<NodeDefinition, 'params'> | null
): string {
  const params = (node?.params ?? {}) as Record<string, unknown>;
  const prompt =
    params.prompt ??
    params.content ??
    params.text ??
    params.description;

  return typeof prompt === 'string' ? prompt : '';
}

export function getNodeTextPreviewValue(
  node?: Pick<NodeDefinition, 'preview' | 'params'> | null
): string {
  if (!node) {
    return '';
  }

  const preview = node.preview as
    | { data?: unknown }
    | undefined;

  if (typeof preview?.data === 'string') {
    return preview.data;
  }

  if (preview?.data && typeof preview.data === 'object') {
    const data = preview.data as Record<string, unknown>;
    const text = data.text ?? data.prompt ?? data.content;
    if (typeof text === 'string') {
      return text;
    }
  }

  return getNodePromptValue(node);
}

export function getNodeModelSelection(
  node?: Pick<NodeDefinition, 'kind' | 'params'> | null
): NodeModelSelection {
  const params = (node?.params ?? {}) as Record<string, unknown>;
  const fallbackModel = getDefaultModelForNodeKind(node?.kind ?? 'Image');
  const selectedModelIds = Array.isArray(params.selectedModels)
    ? params.selectedModels.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const primaryModel =
    (typeof params.model === 'string' && params.model.trim().length > 0 ? params.model : null) ??
    selectedModelIds[0] ??
    fallbackModel;

  const uniqueModelIds = Array.from(new Set([primaryModel, ...selectedModelIds].filter(Boolean)));

  return {
    auto: Boolean(params.modelAuto),
    selectedModelIds: uniqueModelIds.length > 0 ? uniqueModelIds : [fallbackModel],
    useMultipleModels: Boolean(params.useMultipleModels) && uniqueModelIds.length > 1,
  };
}

export function applyNodeModelSelection(
  params: Record<string, unknown> | undefined,
  kind: NodeDefinition['kind'],
  selection: NodeModelSelection
): Record<string, unknown> {
  const fallbackModel = getDefaultModelForNodeKind(kind);
  const selectedModelIds = Array.from(
    new Set(
      selection.selectedModelIds.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    )
  );
  const nextPrimaryModel = selectedModelIds[0] ?? fallbackModel;

  return {
    ...(params ?? {}),
    model: nextPrimaryModel,
    selectedModels: selectedModelIds.length > 0 ? selectedModelIds : [fallbackModel],
    useMultipleModels: selection.useMultipleModels && selectedModelIds.length > 1,
    modelAuto: selection.auto,
  };
}

export function getModelSummaryLabel(selection: NodeModelSelection): string {
  const primaryModelId = selection.selectedModelIds[0];
  const primaryModel = primaryModelId ? getModelById(primaryModelId) : undefined;
  const primaryLabel = primaryModel?.name ?? primaryModelId ?? 'Select model';

  if (selection.useMultipleModels && selection.selectedModelIds.length > 1) {
    return `${primaryLabel} +${selection.selectedModelIds.length - 1}`;
  }

  return primaryLabel;
}
