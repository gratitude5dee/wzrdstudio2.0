import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useConnectionFeedback } from '@/hooks/useConnectionFeedback';

describe('useConnectionFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no rejection', () => {
    const { result } = renderHook(() => useConnectionFeedback());
    expect(result.current.rejection).toBeNull();
  });

  it('shows a rejection with error message and position', () => {
    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Type mismatch: image cannot connect to number',
        'node-target',
        { x: 200, y: 100 }
      );
    });

    expect(result.current.rejection).not.toBeNull();
    expect(result.current.rejection?.error).toBe(
      'Type mismatch: image cannot connect to number'
    );
    expect(result.current.rejection?.targetNodeId).toBe('node-target');
    expect(result.current.rejection?.position).toEqual({ x: 200, y: 100 });
  });

  it('auto-clears rejection after timeout', () => {
    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Cannot connect a node to itself',
        'node-self',
        { x: 100, y: 50 }
      );
    });

    expect(result.current.rejection).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(2300);
    });

    expect(result.current.rejection).toBeNull();
  });

  it('manually clears rejection via clearRejection', () => {
    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Cycle detected',
        'node-cycle',
        { x: 300, y: 200 }
      );
    });

    expect(result.current.rejection).not.toBeNull();

    act(() => {
      result.current.clearRejection();
    });

    expect(result.current.rejection).toBeNull();
  });

  it('debounces rapid identical rejections', () => {
    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Type mismatch: image cannot connect to text',
        'node-A',
        { x: 100, y: 100 }
      );
    });

    const firstKey = result.current.rejection?.key;

    // Immediately call again with the same target+error — should be debounced
    act(() => {
      result.current.showRejection(
        'Type mismatch: image cannot connect to text',
        'node-A',
        { x: 100, y: 100 }
      );
    });

    expect(result.current.rejection?.key).toBe(firstKey);
  });

  it('shows new rejection for different error on same node', () => {
    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Type mismatch: image cannot connect to text',
        'node-A',
        { x: 100, y: 100 }
      );
    });

    const firstKey = result.current.rejection?.key;

    // Different error on same node
    act(() => {
      result.current.showRejection(
        'This connection already exists',
        'node-A',
        { x: 100, y: 100 }
      );
    });

    expect(result.current.rejection?.key).not.toBe(firstKey);
    expect(result.current.rejection?.error).toBe('This connection already exists');
  });

  it('shows new rejection for same error on different node', () => {
    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Type mismatch: image cannot connect to text',
        'node-A',
        { x: 100, y: 100 }
      );
    });

    const firstKey = result.current.rejection?.key;

    // Same error on different node
    act(() => {
      result.current.showRejection(
        'Type mismatch: image cannot connect to text',
        'node-B',
        { x: 200, y: 200 }
      );
    });

    expect(result.current.rejection?.key).not.toBe(firstKey);
    expect(result.current.rejection?.targetNodeId).toBe('node-B');
  });

  it('adds and removes CSS flash class on target node element', () => {
    const div = document.createElement('div');
    div.setAttribute('data-id', 'node-flash');
    document.body.appendChild(div);

    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Cannot connect',
        'node-flash',
        { x: 100, y: 100 }
      );
    });

    expect(div.classList.contains('connection-rejected-flash')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2300);
    });

    expect(div.classList.contains('connection-rejected-flash')).toBe(false);
  });

  it('resolves position from DOM element when not provided', () => {
    const div = document.createElement('div');
    div.setAttribute('data-id', 'node-dom');
    // Mock getBoundingClientRect
    div.getBoundingClientRect = () => ({
      left: 400,
      top: 300,
      width: 200,
      height: 100,
      right: 600,
      bottom: 400,
      x: 400,
      y: 300,
      toJSON: () => ({}),
    });
    document.body.appendChild(div);

    const { result } = renderHook(() => useConnectionFeedback());

    act(() => {
      result.current.showRejection(
        'Type mismatch',
        'node-dom'
      );
    });

    expect(result.current.rejection?.position).toEqual({ x: 500, y: 300 });
  });
});
