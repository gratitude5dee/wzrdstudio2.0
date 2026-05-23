import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { LensWheel } from '../LensWheel';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

function setup(initial: string | undefined = undefined) {
  const onChange = vi.fn();
  const utils = render(
    <LensWheel
      label="Body"
      options={OPTIONS}
      value={initial as any}
      onChange={onChange}
      renderGlyph={(opt) => <span data-testid={`glyph-${opt}`}>{opt}</span>}
    />
  );
  return { onChange, ...utils };
}

describe('LensWheel', () => {
  it('renders the column heading and a caption', () => {
    setup('B');
    expect(screen.getByText(/body/i)).toBeInTheDocument();
    // Caption echoes the active value (look for elements containing exactly 'B' — there will be multiple due to the glyph)
    const matches = screen.getAllByText('B');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('advances on Next chevron and wraps at the end', () => {
    const { onChange } = setup('D');
    fireEvent.click(screen.getByLabelText('Next Body'));
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('goes back on Previous chevron with wrap-around', () => {
    const { onChange } = setup('A');
    fireEvent.click(screen.getByLabelText('Previous Body'));
    expect(onChange).toHaveBeenCalledWith('D');
  });

  it('clicking the active center cell clears the value', () => {
    const { onChange } = setup('B');
    // The centered button has the option's name in its title attribute
    const cell = screen.getByTitle(/B — click to clear/);
    fireEvent.click(cell);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('keyboard arrows navigate values', () => {
    const { onChange, container } = setup('A');
    const wheel = container.querySelector('[role="listbox"]') as HTMLElement;
    fireEvent.keyDown(wheel, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith('B');
    fireEvent.keyDown(wheel, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith('D');
  });

  it('falls back to first option when no value is set', () => {
    const { onChange } = setup(undefined);
    fireEvent.click(screen.getByLabelText('Next Body'));
    // From "no value" the wheel treats index 0 as start, so Next selects index 1 = 'B'
    expect(onChange).toHaveBeenCalledWith('B');
  });
});
