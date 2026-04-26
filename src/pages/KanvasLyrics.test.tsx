import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import KanvasLyrics from './KanvasLyrics';

const renderPage = () =>
  render(
    <MemoryRouter>
      <KanvasLyrics />
    </MemoryRouter>
  );

describe('KanvasLyrics', () => {
  it('renders title and disabled lyrics/markers panels initially', () => {
    renderPage();
    expect(screen.getByText('CREATE TEMPLATE')).toBeInTheDocument();
    expect(screen.getByText('Complete audio step first')).toBeInTheDocument();
    expect(screen.getByText('Complete lyrics step first')).toBeInTheDocument();
  });

  it('save template button is disabled before step 3', () => {
    renderPage();
    const save = screen.getByRole('button', { name: /save template/i });
    expect(save).toBeDisabled();
  });

  it('selecting an audio file reveals the trimmer with confirm button', () => {
    renderPage();
    const fileInput = document.getElementById('kanvas-audio-input') as HTMLInputElement;
    const file = new File(['x'], 'demo.mp3', { type: 'audio/mpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(screen.getByRole('button', { name: /confirm selection/i })).toBeInTheDocument();
  });

  it('confirming audio enables lyrics and advances stepper', () => {
    renderPage();
    const fileInput = document.getElementById('kanvas-audio-input') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'demo.mp3', { type: 'audio/mpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm selection/i }));
    expect(screen.queryByText('Complete audio step first')).not.toBeInTheDocument();
    expect(screen.getByText('Edit Lyrics')).toBeInTheDocument();
  });

  it('done on lyrics enables markers panel and step 3 enables save', () => {
    renderPage();
    const fileInput = document.getElementById('kanvas-audio-input') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'demo.mp3', { type: 'audio/mpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm selection/i }));
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.queryByText('Complete lyrics step first')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save template/i })).not.toBeDisabled();
  });

  it('pressing M adds a marker and Cmd+Z removes it on step 3', () => {
    renderPage();
    const fileInput = document.getElementById('kanvas-audio-input') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'demo.mp3', { type: 'audio/mpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm selection/i }));
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    fireEvent.keyDown(window, { key: 'm' });
    expect(screen.getByText(/1 marker placed/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByText(/no markers/i)).toBeInTheDocument();
  });
});
