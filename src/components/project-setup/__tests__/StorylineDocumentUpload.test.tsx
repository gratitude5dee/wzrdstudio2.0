import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock sonner toast — use vi.hoisted so the reference is available at hoist-time
const { toastMock, mockParseDocument } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  mockParseDocument: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('@/services/documentService', () => ({
  documentService: {
    parseDocument: (...args: unknown[]) => mockParseDocument(...args),
  },
  ACCEPTED_DOCUMENT_EXTENSIONS: '.pdf,.docx,.md,.txt,.text',
}));

// Mock Supabase client (for URL import)
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { StorylineDocumentUpload } from '../StorylineDocumentUpload';

describe('StorylineDocumentUpload', () => {
  const onTextParsed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the drop zone with browse button', () => {
    render(<StorylineDocumentUpload onTextParsed={onTextParsed} />);
    expect(screen.getByText(/drag & drop a script/i)).toBeTruthy();
    expect(screen.getByText(/browse files/i)).toBeTruthy();
  });

  it('renders accepted file types text', () => {
    render(<StorylineDocumentUpload onTextParsed={onTextParsed} />);
    expect(screen.getByText(/PDF, DOCX, MD, TXT/)).toBeTruthy();
  });

  it('has a URL import toggle button', () => {
    render(<StorylineDocumentUpload onTextParsed={onTextParsed} />);
    expect(screen.getByText(/import from url/i)).toBeTruthy();
  });

  it('shows URL input when toggle is clicked', () => {
    render(<StorylineDocumentUpload onTextParsed={onTextParsed} />);
    const toggleBtn = screen.getByText(/import from url/i);
    fireEvent.click(toggleBtn);
    expect(screen.getByPlaceholderText(/https:\/\/example.com/)).toBeTruthy();
  });

  it('calls onTextParsed after successful file parse', async () => {
    mockParseDocument.mockResolvedValueOnce({ text: 'Parsed content', format: 'txt' });
    render(<StorylineDocumentUpload onTextParsed={onTextParsed} />);

    const file = new File(['test content'], 'script.txt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockParseDocument).toHaveBeenCalledWith(file);
      expect(onTextParsed).toHaveBeenCalledWith('Parsed content');
    });
  });

  it('shows error toast on parse failure', async () => {
    mockParseDocument.mockRejectedValueOnce(new Error('Corrupt file'));
    render(<StorylineDocumentUpload onTextParsed={onTextParsed} />);

    const file = new File(['bad'], 'bad.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Corrupt file');
    });
    expect(onTextParsed).not.toHaveBeenCalled();
  });

  it('disables drop zone when disabled prop is true', () => {
    const { container } = render(
      <StorylineDocumentUpload onTextParsed={onTextParsed} disabled={true} />
    );
    // The dropzone div should have opacity-50 and pointer-events-none
    const dropzone = container.querySelector('.pointer-events-none');
    expect(dropzone).toBeTruthy();
  });
});
