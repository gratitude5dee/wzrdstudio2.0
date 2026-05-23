export type ExportRenderBackend = 'fal_remote' | 'remotion_worker';

export const shouldShowRemotePreflightWarnings = ({
  renderBackend,
  warningCount,
  hasDownloadUrl,
}: {
  renderBackend: ExportRenderBackend;
  warningCount: number;
  hasDownloadUrl: boolean;
}) => renderBackend === 'fal_remote' && warningCount > 0 && !hasDownloadUrl;

export const getRemoteVisualClipBlocker = ({
  visualClipCount,
  remoteVisualClipCount,
}: {
  visualClipCount: number;
  remoteVisualClipCount: number;
}) => {
  if (visualClipCount <= 0) {
    return 'Add at least one visual clip before exporting.';
  }
  if (remoteVisualClipCount <= 0) {
    return 'Add at least one visual clip with a public HTTP(S) URL before exporting.';
  }
  return null;
};

export const getExportStartBlocker = ({
  projectId,
  visualClipCount,
  remoteVisualClipCount,
}: {
  projectId: string | null | undefined;
  visualClipCount: number;
  remoteVisualClipCount: number;
}) => {
  if (!projectId) {
    return 'Save the project before exporting.';
  }
  return getRemoteVisualClipBlocker({ visualClipCount, remoteVisualClipCount });
};
