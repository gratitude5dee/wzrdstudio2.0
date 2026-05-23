import React, { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowSettingsMenu, DEFAULT_SETTINGS } from '../WorkflowSettingsMenu';

describe('WorkflowSettingsMenu', () => {
  it('renders the settings trigger button', () => {
    render(
      <WorkflowSettingsMenu
        settings={DEFAULT_SETTINGS}
        onSettingsChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /workflow settings/i })).toBeInTheDocument();
  });

  it('opens the settings menu on click', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowSettingsMenu
        settings={DEFAULT_SETTINGS}
        onSettingsChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /workflow settings/i }));

    expect(screen.getByText('Generation Settings')).toBeInTheDocument();
    expect(screen.getByText('Default Model')).toBeInTheDocument();
    expect(screen.getByText('Output Resolution')).toBeInTheDocument();
    expect(screen.getByText('Workflow Complexity')).toBeInTheDocument();
  });

  it('calls onSettingsChange when model option is clicked', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <WorkflowSettingsMenu
        settings={DEFAULT_SETTINGS}
        onSettingsChange={onSettingsChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /workflow settings/i }));
    await user.click(screen.getByText('Fast'));

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      defaultModel: 'fast',
    });
  });

  it('calls onSettingsChange when resolution option is clicked', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <WorkflowSettingsMenu
        settings={DEFAULT_SETTINGS}
        onSettingsChange={onSettingsChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /workflow settings/i }));
    await user.click(screen.getByText('4K'));

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      outputResolution: '4K',
    });
  });

  it('calls onSettingsChange when complexity option is clicked', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <WorkflowSettingsMenu
        settings={DEFAULT_SETTINGS}
        onSettingsChange={onSettingsChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /workflow settings/i }));
    await user.click(screen.getByText('Advanced'));

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      workflowComplexity: 'advanced',
    });
  });

  it('closes on Escape key', async () => {
    render(
      <WorkflowSettingsMenu
        settings={DEFAULT_SETTINGS}
        onSettingsChange={vi.fn()}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /workflow settings/i }));
    expect(screen.getByText('Generation Settings')).toBeInTheDocument();

    // Dispatch a native keydown event which the component listens for
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    // Wait for AnimatePresence exit animation
    await vi.waitFor(() => {
      expect(screen.queryByText('Generation Settings')).not.toBeInTheDocument();
    });
  });
});
