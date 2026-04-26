import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

const useAuthMock = vi.fn();

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

import ProtectedRoute from '@/components/ProtectedRoute';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('ProtectedRoute', () => {
  it('preserves the attempted destination when redirecting to login', () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/projects/project-1/studio?tab=nodes']}>
        <Routes>
          <Route
            path="/projects/:projectId/studio"
            element={
              <ProtectedRoute>
                <div>Protected</div>
              </ProtectedRoute>
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

    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/login?next=${encodeURIComponent('/projects/project-1/studio?tab=nodes')}`
    );
  });
});
