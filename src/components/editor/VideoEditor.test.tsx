import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  navigate: vi.fn(),
  setProjectId: vi.fn(),
  setProjectName: vi.fn(),
  useAuth: vi.fn(),
  useVideoEditor: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('@/providers/VideoEditorProvider', () => ({
  useVideoEditor: () => mocks.useVideoEditor(),
}));

vi.mock('@/services/supabaseService', () => ({
  supabaseService: {
    projects: {
      create: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('./VideoEditorMain', () => ({
  default: () => <div>Editor Main Ready</div>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

import VideoEditor from './VideoEditor';

describe('VideoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.useVideoEditor.mockReturnValue({
      project: {
        id: 'project-1',
        name: 'Local Editor Smoke',
      },
      setProjectId: mocks.setProjectId,
      setProjectName: mocks.setProjectName,
    });
  });

  it('renders the editor when AuthProvider reports an authenticated user', () => {
    mocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
    });

    render(
      <MemoryRouter>
        <VideoEditor />
      </MemoryRouter>
    );

    expect(screen.getByText('Editor Main Ready')).toBeInTheDocument();
    expect(screen.queryByText('Authentication Required')).not.toBeInTheDocument();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('shows the auth wall and redirects when no authenticated user exists', async () => {
    mocks.useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
    });

    render(
      <MemoryRouter>
        <VideoEditor />
      </MemoryRouter>
    );

    expect(screen.getByText('Authentication Required')).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.getSession).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).toHaveBeenCalledWith('/login');
    });
  });
});
