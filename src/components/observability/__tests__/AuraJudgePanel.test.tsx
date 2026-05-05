import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuraJudgePanel } from '@/components/observability/AuraJudgePanel';
import type { AuraJudgeResult } from '@/services/observabilityService';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const fullResult: AuraJudgeResult = {
  scores: {
    overall: 84,
    technical: 80,
    aesthetic: 82,
    safety: 96,
  },
  promptAdherence: 72,
  characterConsistency: 61,
  spatialConsistency: 88,
  temporalConsistency: 67,
  continuity: 64,
  feedback: 'The shot is strong, but character wardrobe drifts across the motion.',
  tags: ['identity_drift', 'temporal_artifact'],
  suggestions: ['Lock the red jacket and reduce camera drift.'],
  draftImprovements: [
    {
      type: 'increase_identity_conditioning',
      title: 'Lock character wardrobe',
      rationale: 'The jacket changes between frames.',
      draftPrompt: 'Keep the same red jacket and face shape in every frame.',
    },
  ],
  modelUsed: 'Qwen/Qwen3.6-27B-FP8',
  runId: 'run-1',
};

describe('AuraJudgePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits Overshoot judge input with project-level draft-only persistence', async () => {
    const onEvaluate = vi.fn().mockResolvedValue(fullResult);

    render(<AuraJudgePanel projectId="project-1" onEvaluate={onEvaluate} />);

    fireEvent.change(screen.getByPlaceholderText('https://example.com/media.png'), {
      target: { value: 'https://cdn.example.com/shot.mp4' },
    });
    fireEvent.change(screen.getByLabelText('Media type'), {
      target: { value: 'video' },
    });
    fireEvent.change(screen.getByLabelText('Judge mode'), {
      target: { value: 'full' },
    });
    fireEvent.change(screen.getByPlaceholderText('Original generation prompt or shot prompt'), {
      target: { value: 'A detective walks through neon rain.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Reference URLs, one per line'), {
      target: { value: 'https://cdn.example.com/reference.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: /evaluate/i }));

    await waitFor(() => expect(onEvaluate).toHaveBeenCalledTimes(1));
    expect(onEvaluate).toHaveBeenCalledWith({
      mediaUrl: 'https://cdn.example.com/shot.mp4',
      mediaType: 'video',
      mode: 'full',
      criteria: undefined,
      promptText: 'A detective walks through neon rain.',
      referenceUrls: ['https://cdn.example.com/reference.png'],
      projectId: 'project-1',
      targetType: 'project',
      persist: true,
    });
  });

  it('renders consistency scores, model provenance, and draft improvements', async () => {
    const onEvaluate = vi.fn().mockResolvedValue(fullResult);

    render(<AuraJudgePanel projectId="project-1" onEvaluate={onEvaluate} />);

    fireEvent.change(screen.getByPlaceholderText('https://example.com/media.png'), {
      target: { value: 'https://cdn.example.com/shot.mp4' },
    });
    fireEvent.change(screen.getByLabelText('Media type'), {
      target: { value: 'video' },
    });
    fireEvent.click(screen.getByRole('button', { name: /evaluate/i }));

    expect(await screen.findByText('Qwen/Qwen3.6-27B-FP8')).toBeInTheDocument();
    expect(screen.getByText('Character consistency')).toBeInTheDocument();
    expect(screen.getByText('Temporal consistency')).toBeInTheDocument();
    expect(screen.getByText('Lock character wardrobe')).toBeInTheDocument();
    expect(screen.getByText('Keep the same red jacket and face shape in every frame.')).toBeInTheDocument();
    expect(screen.getByText('Persisted run run-1')).toBeInTheDocument();
  });

  it('renders legacy judge responses without optional Overshoot fields', async () => {
    const legacyResult: AuraJudgeResult = {
      scores: { overall: 91, technical: 90 },
      feedback: 'Clean image.',
      tags: [],
      suggestions: [],
    };
    const onEvaluate = vi.fn().mockResolvedValue(legacyResult);

    render(<AuraJudgePanel onEvaluate={onEvaluate} />);

    fireEvent.change(screen.getByPlaceholderText('https://example.com/media.png'), {
      target: { value: 'https://cdn.example.com/image.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: /evaluate/i }));

    expect(await screen.findByText('Clean image.')).toBeInTheDocument();
    expect(screen.getByText('No tags returned')).toBeInTheDocument();
    expect(screen.getByText('No suggestions returned')).toBeInTheDocument();
  });
});
