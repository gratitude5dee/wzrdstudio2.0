import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '@/components/home/Sidebar';
import { MobileSidebarDrawer } from '@/components/home/MobileSidebarDrawer';
import { SidebarProvider } from '@/contexts/SidebarContext';

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { email: 'creator@example.com' },
  }),
}));

vi.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({
    availableCredits: 100,
    isLoading: false,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-path">{location.pathname}</span>;
}

function renderDesktopSidebar() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <SidebarProvider>
        <Sidebar activeView="all" onViewChange={vi.fn()} />
        <LocationProbe />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

function renderMobileDrawer() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <MobileSidebarDrawer
        activeView="all"
        isOpen
        onClose={vi.fn()}
        onViewChange={vi.fn()}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function getPrimaryNavLabels() {
  const primaryLabels = ['All Projects', 'Kanvas', 'Aura', 'Asset Store', 'IP Vault'];
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '')
    .filter((label) => primaryLabels.includes(label));
}

describe('home navigation IP Vault entry', () => {
  beforeEach(() => {
    localStorage.clear();
    const observer = vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
    }));
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: observer,
    });
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      writable: true,
      value: observer,
    });
  });

  it('places IP Vault after Asset Store in the desktop sidebar and navigates to it', () => {
    renderDesktopSidebar();

    expect(getPrimaryNavLabels()).toEqual([
      'All Projects',
      'Kanvas',
      'Aura',
      'Asset Store',
      'IP Vault',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /ip vault/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
  });

  it('places IP Vault after Asset Store in the mobile drawer and navigates to it', () => {
    renderMobileDrawer();

    expect(getPrimaryNavLabels()).toEqual([
      'All Projects',
      'Kanvas',
      'Aura',
      'Asset Store',
      'IP Vault',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /ip vault/i }));
    expect(screen.getByTestId('location-path')).toHaveTextContent('/ip-vault');
  });
});
