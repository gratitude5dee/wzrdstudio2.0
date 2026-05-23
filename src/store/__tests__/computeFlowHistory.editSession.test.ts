import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { ComputeFlowHistoryManager } from '@/store/computeFlowHistory';
import type { NodeDefinition } from '@/types/computeFlow';

function node(id: string, prompt: string): NodeDefinition {
  return {
    id,
    kind: 'Image',
    version: '1',
    label: 'N',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    params: { prompt },
    status: 'idle',
  };
}

describe('ComputeFlowHistoryManager edit-session coalescing (PR-6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a stream of keystrokes into one snapshot per session', () => {
    const m = new ComputeFlowHistoryManager();
    // Seed an initial snapshot so historyIndex starts at 0.
    m.pushSnapshot([node('a', '')], [], 'Initial');
    expect(m.getState().canUndo).toBe(false);

    m.beginEditSession('a');
    for (let i = 1; i <= 10; i++) {
      m.pushSnapshot([node('a', 'x'.repeat(i))], [], `Updated N`);
    }
    // Still no new history entry while session is open.
    expect(m.getState().canUndo).toBe(false);

    m.endEditSession();
    // Exactly one new entry appended.
    expect(m.getState().canUndo).toBe(true);
    expect(m.getState().canRedo).toBe(false);

    // Undo returns the pre-edit snapshot (prompt: '').
    const undone = m.undo();
    expect(undone?.nodes[0].params.prompt).toBe('');
  });

  it('auto-flushes an edit session after the idle timeout', () => {
    const m = new ComputeFlowHistoryManager();
    m.pushSnapshot([node('a', '')], [], 'Initial');

    m.beginEditSession('a');
    m.pushSnapshot([node('a', 'hi')], [], 'Updated N');
    expect(m.isInEditSession()).toBe(true);

    // Advance past the idle threshold (400ms).
    vi.advanceTimersByTime(500);
    expect(m.isInEditSession()).toBe(false);
    expect(m.getState().canUndo).toBe(true);
  });

  it('still records non-edit-session changes immediately', () => {
    const m = new ComputeFlowHistoryManager();
    m.pushSnapshot([node('a', '')], [], 'Initial');
    m.pushSnapshot([node('a', 'one')], [], 'Updated N');
    expect(m.getState().canUndo).toBe(true);
  });
});
