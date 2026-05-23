import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SummaryCell } from '../SummaryCell';

describe('SummaryCell', () => {
  it('renders the label and a dash when no value is set', () => {
    render(<SummaryCell label="Body" glyph={<svg data-testid="glyph" />} />);
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the value with the orange tint class when populated', () => {
    render(<SummaryCell label="Lens" value="Cooke S4" glyph={<svg data-testid="glyph" />} />);
    const valueEl = screen.getByText('Cooke S4');
    expect(valueEl).toBeInTheDocument();
    expect(valueEl.className).toMatch(/fdba74/);
  });

  it('fires onClick when activated', () => {
    const onClick = vi.fn();
    render(
      <SummaryCell
        label="Focal"
        value="50mm"
        glyph={<svg data-testid="glyph" />}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /focal — 50mm/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
