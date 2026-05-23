import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from '../LoadingScreen';

describe('LoadingScreen', () => {
  it('renders when isLoading is true', () => {
    render(<LoadingScreen isLoading={true} />);
    expect(screen.getByText('Initializing studio...')).toBeInTheDocument();
    expect(screen.getByAltText('WZRD')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<LoadingScreen isLoading={true} message="Initializing MOG Studio..." />);
    expect(screen.getByText('Initializing MOG Studio...')).toBeInTheDocument();
  });

  it('does not render content when isLoading is false', () => {
    render(<LoadingScreen isLoading={false} />);
    expect(screen.queryByText('Initializing studio...')).not.toBeInTheDocument();
    expect(screen.queryByAltText('WZRD')).not.toBeInTheDocument();
  });

  it('uses wzrdtechlogo.png as the logo source', () => {
    render(<LoadingScreen isLoading={true} />);
    const logo = screen.getByAltText('WZRD');
    expect(logo).toHaveAttribute('src', '/lovable-uploads/wzrdtechlogo.png');
  });

  it('contains no green or emerald color classes', () => {
    const { container } = render(<LoadingScreen isLoading={true} />);
    const html = container.innerHTML;
    // Ensure no green/emerald Tailwind classes leaked in
    expect(html).not.toMatch(/\bgreen-/);
    expect(html).not.toMatch(/\bemerald-/);
  });

  it('renders the current fallback halo layer', () => {
    const { container } = render(<LoadingScreen isLoading={true} />);
    expect(container.querySelector('.rounded-full.absolute')).toBeInTheDocument();
  });

  it('has responsive classes for mobile viewports', () => {
    const { container } = render(<LoadingScreen isLoading={true} />);
    const html = container.innerHTML;
    // Check for responsive sm: breakpoint classes
    expect(html).toMatch(/sm:/);
  });
});
