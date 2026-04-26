import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Keep a reference to the real createElement so we can delegate for non-canvas tags
const realCreateElement = document.createElement.bind(document);

// Mock Three.js ecosystem to avoid WebGL context issues in jsdom
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, fallback, ...props }: any) => (
    <div data-testid="r3f-canvas" {...props}>
      {children}
    </div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({
    viewport: { width: 10, height: 8 },
  }),
}));

vi.mock('@react-three/drei', () => ({
  useTexture: () => ({ image: { width: 400, height: 200 } }),
}));

vi.mock('@react-three/postprocessing', () => ({
  EffectComposer: ({ children }: any) => <>{children}</>,
  Bloom: () => null,
  Vignette: () => null,
}));

vi.mock('three', () => ({
  default: {},
  Mesh: class {},
  Points: class {},
  BufferAttribute: class {},
  ShaderMaterial: class {},
}));

import CinematicIntro from '../CinematicIntro';

/**
 * Helper to mock document.createElement so that canvas.getContext
 * returns a truthy value for WebGL contexts (simulating WebGL availability).
 */
function mockWebGLAvailable(available: boolean) {
  vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, options?: ElementCreationOptions) => {
      const el = realCreateElement(tagName, options);
      if (tagName === 'canvas') {
        (el as HTMLCanvasElement).getContext = ((id: string) => {
          if (
            available &&
            (id === 'webgl2' || id === 'webgl' || id === 'experimental-webgl')
          ) {
            return {} as WebGLRenderingContext; // truthy mock
          }
          return null;
        }) as typeof el.getContext;
      }
      return el;
    },
  );
}

describe('CinematicIntro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWebGLAvailable(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders WebGL canvas on mount', () => {
    const onComplete = vi.fn();
    render(<CinematicIntro onComplete={onComplete} />);

    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();
  });

  it('calls onComplete after full animation sequence (~5s)', () => {
    const onComplete = vi.fn();
    render(<CinematicIntro onComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('dismisses on click (skip)', () => {
    const onComplete = vi.fn();
    render(<CinematicIntro onComplete={onComplete} />);

    const overlay = screen.getByRole('presentation');
    fireEvent.click(overlay);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows skip hint text', () => {
    const onComplete = vi.fn();
    render(<CinematicIntro onComplete={onComplete} />);

    expect(screen.getByText('Click anywhere to skip')).toBeInTheDocument();
  });

  it('returns null after completion', () => {
    const onComplete = vi.fn();
    render(<CinematicIntro onComplete={onComplete} />);

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(screen.queryByTestId('r3f-canvas')).not.toBeInTheDocument();
  });

  it('returns null after skip click', () => {
    const onComplete = vi.fn();
    render(<CinematicIntro onComplete={onComplete} />);

    const overlay = screen.getByRole('presentation');
    fireEvent.click(overlay);

    expect(screen.queryByTestId('r3f-canvas')).not.toBeInTheDocument();
  });

  it('skips intro when WebGL is not available', () => {
    vi.restoreAllMocks(); // clear the WebGL-available mock
    mockWebGLAvailable(false);

    const onComplete = vi.fn();
    render(<CinematicIntro onComplete={onComplete} />);

    // Should immediately schedule onComplete since WebGL is unavailable
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(onComplete).toHaveBeenCalled();
    expect(screen.queryByTestId('r3f-canvas')).not.toBeInTheDocument();
  });
});
