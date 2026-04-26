import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from '../LoadingScreen';

describe('LoadingScreen', () => {
  it('renders when isLoading is true', () => {
    const { container } = render(<LoadingScreen isLoading={true} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByAltText('WZRD Logo')).toBeInTheDocument();
    // Progress bar track is present
    expect(container.querySelector('.absolute.bottom-0')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<LoadingScreen isLoading={true} message="Initializing MOG Studio..." />);
    expect(screen.getByText('Initializing MOG Studio...')).toBeInTheDocument();
  });

  it('does not render content when isLoading is false', () => {
    render(<LoadingScreen isLoading={false} />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByAltText('WZRD Logo')).not.toBeInTheDocument();
  });

  it('uses wzrdtechlogo.png as the logo source', () => {
    render(<LoadingScreen isLoading={true} />);
    const logo = screen.getByAltText('WZRD Logo');
    expect(logo).toHaveAttribute('src', '/lovable-uploads/wzrdtechlogo.png');
  });

  it('contains no green or emerald color classes', () => {
    const { container } = render(<LoadingScreen isLoading={true} />);
    const html = container.innerHTML;
    // Ensure no green/emerald Tailwind classes leaked in
    expect(html).not.toMatch(/\bgreen-/);
    expect(html).not.toMatch(/\bemerald-/);
  });

  it('uses orange/amber colors for themed elements', () => {
    const { container } = render(<LoadingScreen isLoading={true} />);
    const html = container.innerHTML;
    // Should have orange and amber Tailwind classes
    expect(html).toMatch(/orange-500/);
    expect(html).toMatch(/amber-500/);
  });

  it('has responsive classes for mobile viewports', () => {
    const { container } = render(<LoadingScreen isLoading={true} />);
    const html = container.innerHTML;
    // Check for responsive sm: breakpoint classes
    expect(html).toMatch(/sm:/);
  });
});
