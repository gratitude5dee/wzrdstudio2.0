import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreamingTextAnimate } from '../StreamingTextAnimate';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
}));

describe('StreamingTextAnimate', () => {
  it('renders the provided text', () => {
    render(<StreamingTextAnimate text="Hello world" />);
    expect(screen.getByText(/Hello/)).toBeTruthy();
    expect(screen.getByText(/world/)).toBeTruthy();
  });

  it('renders empty when text is empty', () => {
    const { container } = render(<StreamingTextAnimate text="" />);
    // Should have only the <p> wrapper, nothing meaningful inside
    const p = container.querySelector('p');
    expect(p).toBeTruthy();
    expect(p!.textContent?.trim()).toBe('');
  });

  it('shows blinking cursor when isStreaming is true', () => {
    const { container } = render(
      <StreamingTextAnimate text="Streaming text" isStreaming={true} />
    );
    // The cursor is a motion.span with specific classes
    const spans = container.querySelectorAll('span');
    const cursorSpan = Array.from(spans).find(
      (s) => s.className.includes('bg-primary') && s.className.includes('w-0.5')
    );
    expect(cursorSpan).toBeTruthy();
  });

  it('does not show cursor when isStreaming is false', () => {
    const { container } = render(
      <StreamingTextAnimate text="Done text" isStreaming={false} />
    );
    const spans = container.querySelectorAll('span');
    const cursorSpan = Array.from(spans).find(
      (s) => s.className.includes('bg-primary') && s.className.includes('w-0.5')
    );
    expect(cursorSpan).toBeFalsy();
  });

  it('applies custom className to the root element', () => {
    const { container } = render(
      <StreamingTextAnimate text="test" className="text-red-500" />
    );
    const p = container.querySelector('p');
    expect(p?.className).toContain('text-red-500');
  });

  it('splits text into individual word spans', () => {
    const { container } = render(
      <StreamingTextAnimate text="one two three" />
    );
    // Words + whitespace are split: ["one", " ", "two", " ", "three"]
    const spans = container.querySelectorAll('p > span');
    // At least the word spans should be present
    expect(spans.length).toBeGreaterThanOrEqual(3);
  });
});
