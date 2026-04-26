import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => ({
  invoke: vi.fn(),
  getUser: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: mockSupabase.getUser,
    },
    functions: {
      invoke: mockSupabase.invoke,
    },
  },
}));

import { ProjectSharePopover } from './ProjectSharePopover';

describe('ProjectSharePopover', () => {
  beforeEach(() => {
    mockSupabase.getUser.mockReset();
    mockSupabase.invoke.mockReset();
    mockSupabase.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'owner@example.com',
          user_metadata: {
            display_name: 'Studio Owner',
          },
        },
      },
    });
    mockSupabase.invoke.mockResolvedValue({
      data: {
        shareLink: 'https://example.com/share/abc123',
      },
      error: null,
    });
    mockSupabase.writeText.mockReset();
    mockSupabase.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (...args: unknown[]) => mockSupabase.writeText(...args),
      },
    });
  });

  it('opens an anchored share menu and copies a generated link', async () => {
    const user = userEvent.setup();

    render(<ProjectSharePopover projectId="project-1" projectName="Graphic Design" />);

    await user.click(screen.getByRole('button', { name: /share/i }));

    expect(await screen.findByText('Share this project')).toBeInTheDocument();
    expect(screen.getByText('Publish')).toBeInTheDocument();
    expect(await screen.findByText('Studio Owner')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => {
      expect(mockSupabase.invoke).toHaveBeenCalledWith('create-share', {
        body: {
          projectId: 'project-1',
          permission: 'view',
          isPublic: true,
          inviteEmail: undefined,
        },
      });
    });

    expect(await screen.findByText(/can view link ready/i)).toBeInTheDocument();
  });
});
