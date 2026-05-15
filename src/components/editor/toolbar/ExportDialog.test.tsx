import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoEditorStore, type Clip } from '@/store/videoEditorStore';
import {
  getExportStartBlocker,
  getRemoteVisualClipBlocker,
  shouldShowRemotePreflightWarnings,
} from './exportDialogState';
import { ExportDialog } from './ExportDialog';

const exportHarness = vi.hoisted(() => ({
  exportVideo: vi.fn(),
  resetExportState: vi.fn(),
  state: {
    isExporting: false,
    progress: 0,
    error: null as string | null,
    downloadUrl: null as string | null,
    renderWarnings: [] as Array<{ assetId: string; orderIndex: number; features: string[]; reason: string }>,
  },
}));

vi.mock('@/hooks/useExport', () => ({
  useExport: () => ({
    exportVideo: exportHarness.exportVideo,
    resetExportState: exportHarness.resetExportState,
    isExporting: exportHarness.state.isExporting,
    progress: exportHarness.state.progress,
    error: exportHarness.state.error,
    downloadUrl: exportHarness.state.downloadUrl,
    renderWarnings: exportHarness.state.renderWarnings,
  }),
}));

const createClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Remote clip',
  url: 'https://cdn.example.com/editor/clip.mp4',
  startTime: 0,
  duration: 5000,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  ...overrides,
});

beforeEach(() => {
  exportHarness.exportVideo.mockReset();
  exportHarness.resetExportState.mockReset();
  exportHarness.state.isExporting = false;
  exportHarness.state.progress = 0;
  exportHarness.state.error = null;
  exportHarness.state.downloadUrl = null;
  exportHarness.state.renderWarnings = [];

  useVideoEditorStore.setState({
    project: {
      id: 'project-1',
      name: 'Editor Export Test',
      duration: 5000,
      fps: 30,
      resolution: { width: 1920, height: 1080 },
      transforms: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    },
    clips: [],
    audioTracks: [],
    keyframes: [],
    selectedClipIds: [],
    selectedAudioTrackIds: [],
    selectedKeyframeIds: [],
  });
});

describe('ExportDialog preflight warnings', () => {
  it('shows skipped-styling warnings only for the fast FAL renderer', () => {
    expect(
      shouldShowRemotePreflightWarnings({
        renderBackend: 'fal_remote',
        warningCount: 1,
        hasDownloadUrl: false,
      })
    ).toBe(true);

    expect(
      shouldShowRemotePreflightWarnings({
        renderBackend: 'remotion_worker',
        warningCount: 1,
        hasDownloadUrl: false,
      })
    ).toBe(false);
  });

  it('hides warnings after an export download URL is available', () => {
    expect(
      shouldShowRemotePreflightWarnings({
        renderBackend: 'fal_remote',
        warningCount: 1,
        hasDownloadUrl: true,
      })
    ).toBe(false);
  });

  it('blocks exports without a remote-fetchable visual clip', () => {
    expect(getRemoteVisualClipBlocker({ visualClipCount: 0, remoteVisualClipCount: 0 })).toBe(
      'Add at least one visual clip before exporting.'
    );
    expect(getRemoteVisualClipBlocker({ visualClipCount: 1, remoteVisualClipCount: 0 })).toBe(
      'Add at least one visual clip with a public HTTP(S) URL before exporting.'
    );
    expect(getRemoteVisualClipBlocker({ visualClipCount: 1, remoteVisualClipCount: 1 })).toBeNull();
  });

  it('blocks exports for unsaved projects before checking media fetchability', () => {
    expect(
      getExportStartBlocker({
        projectId: null,
        visualClipCount: 1,
        remoteVisualClipCount: 1,
      })
    ).toBe('Save the project before exporting.');

    expect(
      getExportStartBlocker({
        projectId: 'project-1',
        visualClipCount: 1,
        remoteVisualClipCount: 1,
      })
    ).toBeNull();
  });

  it('renders the public URL blocker and disables export for local-only clips', () => {
    useVideoEditorStore.setState({
      clips: [createClip({ url: 'blob:http://localhost/local-preview' })],
    });

    render(<ExportDialog open onOpenChange={() => {}} />);

    expect(screen.getByText('Export needs remote media.')).toBeInTheDocument();
    expect(screen.getByText('Add at least one visual clip with a public HTTP(S) URL before exporting.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start export/i })).toBeDisabled();
  });

  it('passes the styled Remotion worker backend when selected', async () => {
    const user = userEvent.setup();
    useVideoEditorStore.setState({
      clips: [createClip()],
    });

    render(<ExportDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /styled/i }));
    await user.click(screen.getByRole('button', { name: /start export/i }));

    expect(exportHarness.exportVideo).toHaveBeenCalledWith({
      format: 'mp4',
      quality: 'high',
      renderBackend: 'remotion_worker',
    });
  });
});
