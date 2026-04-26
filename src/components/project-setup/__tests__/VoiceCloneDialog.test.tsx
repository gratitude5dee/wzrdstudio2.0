import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceCloneDialog } from '../VoiceCloneDialog';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('VoiceCloneDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    render(<VoiceCloneDialog {...defaultProps} />);
    // "Clone Voice" appears in both title and button; check at least one
    expect(screen.getAllByText(/Clone Voice/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Upload a clear audio recording/)).toBeTruthy();
  });

  it('shows format and duration requirements', () => {
    render(<VoiceCloneDialog {...defaultProps} />);
    // Multiple elements may contain "MP3 or WAV" (info box + dropzone hint)
    expect(screen.getAllByText(/MP3 or WAV/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/30 seconds to 5 minutes/)).toBeTruthy();
  });

  it('renders voice name input field', () => {
    render(<VoiceCloneDialog {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('e.g., My Custom Voice');
    expect(nameInput).toBeTruthy();
  });

  it('renders upload drop zone when no file selected', () => {
    render(<VoiceCloneDialog {...defaultProps} />);
    expect(screen.getByText('Drop audio file here or click to browse')).toBeTruthy();
  });

  it('disables clone button when no file or name', () => {
    render(<VoiceCloneDialog {...defaultProps} />);
    // There are multiple elements with "Clone Voice" text; find the button in the footer
    const buttons = screen.getAllByRole('button');
    const cloneButton = buttons.find(
      (btn) => btn.textContent?.includes('Clone Voice') && !btn.textContent?.includes('Cancel')
    );
    expect(cloneButton).toBeTruthy();
    expect(cloneButton!.hasAttribute('disabled')).toBe(true);
  });

  it('shows cancel button that calls onOpenChange', () => {
    render(<VoiceCloneDialog {...defaultProps} />);
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render content when closed', () => {
    render(<VoiceCloneDialog {...defaultProps} open={false} />);
    expect(screen.queryByText(/Upload a clear audio recording/)).toBeFalsy();
  });

  it('shows quality requirements info box', () => {
    render(<VoiceCloneDialog {...defaultProps} />);
    expect(screen.getByText(/Clear speech, minimal background/)).toBeTruthy();
  });
});
