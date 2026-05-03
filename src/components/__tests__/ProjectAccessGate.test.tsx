import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  setActiveProjectMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => mocks.useAuthMock(),
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: <T,>(selector: (state: { setActiveProject: typeof mocks.setActiveProjectMock }) => T) =>
    selector({ setActiveProject: mocks.setActiveProjectMock }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: [string]) => mocks.fromMock(...args),
  },
}));

import { ProjectAccessGate } from '@/components/ProjectAccessGate';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function mockProjectLookup(result: { data: { id: string; title: string | null } | null; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  mocks.fromMock.mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

function renderGate(initialPath = '/projects/project-1/editor') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/projects/:projectId/:surface"
          element={
            <ProjectAccessGate projectId="project-1">
              <div>Editor Shell</div>
            </ProjectAccessGate>
          }
        />
        <Route
          path="/login"
          element={
            <>
              <div>Login</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProjectAccessGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    '/projects/project-1/editor?tab=timeline',
    '/projects/project-1/timeline',
    '/projects/project-1/studio',
    '/projects/project-1/directors-cut',
  ])('redirects unauthenticated users from %s before fetching project data', async (path) => {
    mocks.useAuthMock.mockReturnValue({ isAuthenticated: false, loading: false });

    renderGate(path);

    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/login?next=${encodeURIComponent(path)}`
    );
    expect(mocks.fromMock).not.toHaveBeenCalled();
    expect(mocks.setActiveProjectMock).not.toHaveBeenCalled();
  });

  it('shows a loading state while auth is still resolving', () => {
    mocks.useAuthMock.mockReturnValue({ isAuthenticated: false, loading: true });

    renderGate();

    expect(screen.getByText('Checking project access...')).toBeInTheDocument();
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });

  it('verifies project ownership once and mounts children when allowed', async () => {
    mocks.useAuthMock.mockReturnValue({ isAuthenticated: true, loading: false });
    const query = mockProjectLookup({ data: { id: 'project-1', title: 'Film Project' }, error: null });

    renderGate();

    expect(await screen.findByText('Editor Shell')).toBeInTheDocument();
    expect(mocks.fromMock).toHaveBeenCalledWith('projects');
    expect(query.select).toHaveBeenCalledWith('id, title');
    expect(query.eq).toHaveBeenCalledWith('id', 'project-1');
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.setActiveProjectMock).toHaveBeenCalledWith('project-1', 'Film Project');
  });

  it('renders a denied state when the project lookup fails', async () => {
    mocks.useAuthMock.mockReturnValue({ isAuthenticated: true, loading: false });
    mockProjectLookup({ data: null, error: { message: 'RLS denied' } });

    renderGate();

    expect(await screen.findByText('Project unavailable')).toBeInTheDocument();
    expect(screen.getByText('Project not found or you do not have access.')).toBeInTheDocument();
    await waitFor(() => expect(mocks.setActiveProjectMock).not.toHaveBeenCalled());
  });
});
