import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  isDevAuthBypassEnabled: vi.fn(),
  navigate: vi.fn(),
  setActiveProject: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: () => ({
    setActiveProject: mocks.setActiveProject,
  }),
}));

vi.mock('@/services/supabaseService', () => ({
  supabaseService: {
    projects: {
      find: mocks.findProject,
    },
  },
}));

vi.mock('@/lib/devAuthBypass', () => ({
  isDevAuthBypassEnabled: () => mocks.isDevAuthBypassEnabled(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('@/components/AppHeader', () => ({
  default: () => <header>App Header</header>,
}));

vi.mock('@/providers/VideoEditorProvider', () => ({
  VideoEditorProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="video-editor-provider">{children}</div>
  ),
}));

vi.mock('@/components/editor/VideoEditor', () => ({
  default: () => <div>Video Editor</div>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

import EditorPage from './EditorPage';

function renderEditorPage(path = '/projects/project-1/editor') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/editor" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue({ id: 'project-1', title: 'Fetched Project' });
    mocks.isDevAuthBypassEnabled.mockReturnValue(false);
  });

  it('uses the dev local project without fetching Supabase project details', async () => {
    mocks.isDevAuthBypassEnabled.mockReturnValue(true);

    renderEditorPage('/projects/local-editor/editor');

    expect(screen.getByText('App Header')).toBeInTheDocument();
    expect(screen.getByText('Video Editor')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.setActiveProject).toHaveBeenCalledWith('local-editor', 'Local Editor Smoke');
    });

    expect(mocks.findProject).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('fetches project details in normal mode', async () => {
    renderEditorPage();

    await waitFor(() => {
      expect(mocks.findProject).toHaveBeenCalledWith('project-1');
      expect(mocks.setActiveProject).toHaveBeenCalledWith('project-1', 'Fetched Project');
    });
  });
});
