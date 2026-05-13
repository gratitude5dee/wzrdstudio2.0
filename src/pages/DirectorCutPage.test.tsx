import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useDirectorCutMock, setActiveProjectMock } = vi.hoisted(() => ({
  useDirectorCutMock: vi.fn(),
  setActiveProjectMock: vi.fn(),
}));

vi.mock('@/components/AppHeader', () => ({
  default: () => <div data-testid="app-header" />,
}));

vi.mock('@/services/supabaseService', () => ({
  supabaseService: {
    projects: {
      find: vi.fn(async () => ({ id: 'project-1', title: 'Test Project' })),
    },
  },
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: () => ({
    setActiveProject: setActiveProjectMock,
  }),
}));

vi.mock('@/hooks/useDirectorCut', () => ({
  STAGE_LABELS: {
    idle: 'Idle',
    syncing_assets: 'Syncing timeline assets',
    preflighting_assets: 'Checking media URLs',
    submitting_to_provider: 'Submitting to provider',
    provider_processing: 'Provider processing',
    fallback_processing: 'Editframe fallback',
    downloading_assets: 'Downloading assets',
    uploading_final_video: 'Uploading final video',
    failed: 'Failed',
    completed: 'Completed',
  },
  useDirectorCut: useDirectorCutMock,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import DirectorCutPage from './DirectorCutPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/projects/project-1/directors-cut']}>
      <Routes>
        <Route path="/projects/:projectId/directors-cut" element={<DirectorCutPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('DirectorCutPage', () => {
  beforeEach(() => {
    setActiveProjectMock.mockReset();
    useDirectorCutMock.mockReset();
    useDirectorCutMock.mockReturnValue({
      summary: {
        totalShots: 1,
        syncedAssets: 1,
        visualAssets: 1,
        readyShots: 1,
        readyVideos: 0,
        fallbackImages: 1,
        missingShots: 0,
        missingShotDetails: [],
        audioAssets: 0,
        canExport: true,
        blockingReason: null,
      },
      job: {
        jobId: 'job-failed',
        status: 'failed',
        progress: 50,
        stage: 'failed',
        error: 'Fal render failed; Editframe fallback failed: render rejected. Fal error: bad source',
        provider: 'editframe_remote',
        providerStatus: 'failed',
        providerJobId: 'editframe-render-1',
        fallbackUsed: true,
        renderer: 'editframe/render-api',
        falRequestId: 'fal-request-1',
        falError: 'bad source',
        fallbackReason: 'fal_failed',
        fallbackStatus: 'failed',
        fallbackError: 'render rejected',
        failedShotCount: 1,
        debugSummary: {
          stage: 'failed',
          renderer: 'editframe/render-api',
          falRequestId: 'fal-request-1',
          fallbackStatus: 'failed',
          fallbackError: 'render rejected',
          falError: 'bad source',
          failedShotCount: 1,
        },
        providerPayload: {
          stage: 'failed',
          renderer: 'editframe/render-api',
        },
        shotFailures: [
          { assetId: 'asset-1', orderIndex: 0, reason: 'URL range preflight failed (403)' },
        ],
        partialSuccess: false,
      },
      error: 'Fal render failed; Editframe fallback failed: render rejected. Fal error: bad source',
      isSyncing: false,
      isStarting: false,
      isPolling: false,
      syncAssets: vi.fn(async () => null),
      startDirectorCut: vi.fn(async () => null),
    });
  });

  it('renders fal and Editframe failure diagnostics from polling status', () => {
    renderPage();

    expect(screen.getByText("Director's Cut failed")).toBeInTheDocument();
    expect(screen.getByText('Render diagnostics')).toBeInTheDocument();
    expect(screen.getByText('editframe/render-api')).toBeInTheDocument();
    expect(screen.getByText('fal-request-1')).toBeInTheDocument();
    expect(screen.getByText('editframe-render-1')).toBeInTheDocument();
    expect(screen.getAllByText('render rejected').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bad source').length).toBeGreaterThan(0);
    expect(screen.getByText('Shot #1: URL range preflight failed (403)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy debug details/i })).toBeInTheDocument();
  });

  it('shows available-content warning and keeps export enabled when some shots are missing', () => {
    useDirectorCutMock.mockReturnValue({
      summary: {
        totalShots: 15,
        syncedAssets: 3,
        visualAssets: 3,
        readyShots: 3,
        readyVideos: 1,
        fallbackImages: 2,
        missingShots: 12,
        skippedShotCount: 12,
        exportMode: 'available_content',
        isCompleteCut: false,
        missingShotDetails: [
          {
            shotId: 'shot-2',
            sceneId: 'scene-1',
            sceneNumber: 1,
            shotNumber: 2,
            reason: 'Missing shot image or video',
          },
        ],
        audioAssets: 0,
        canExport: true,
        blockingReason: null,
      },
      job: null,
      error: null,
      isSyncing: false,
      isStarting: false,
      isPolling: false,
      syncAssets: vi.fn(async () => null),
      startDirectorCut: vi.fn(async () => null),
    });

    renderPage();

    expect(screen.getByText('12 shots will be skipped')).toBeInTheDocument();
    expect(screen.getByText(/Scene 1, shot 2: Missing shot image or video/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start director/i })).not.toBeDisabled();
  });

  it('shows strict blocked banner only when no visual assets exist', () => {
    useDirectorCutMock.mockReturnValue({
      summary: {
        totalShots: 2,
        syncedAssets: 0,
        visualAssets: 0,
        readyShots: 0,
        readyVideos: 0,
        fallbackImages: 0,
        missingShots: 2,
        skippedShotCount: 2,
        exportMode: 'blocked',
        isCompleteCut: false,
        missingShotDetails: [
          {
            shotId: 'shot-1',
            sceneId: 'scene-1',
            sceneNumber: 1,
            shotNumber: 1,
            reason: 'Missing shot image or video',
          },
        ],
        audioAssets: 0,
        canExport: false,
        blockingReason: "No generated shot image or video assets are available for Director's Cut.",
      },
      job: null,
      error: null,
      isSyncing: false,
      isStarting: false,
      isPolling: false,
      syncAssets: vi.fn(async () => null),
      startDirectorCut: vi.fn(async () => null),
    });

    renderPage();

    expect(screen.getByText("Director's Cut export is blocked")).toBeInTheDocument();
    expect(screen.queryByText(/shots will be skipped/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start director/i })).toBeDisabled();
  });
});
