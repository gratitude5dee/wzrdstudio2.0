import { describe, expect, it } from 'vitest';
import { buildEditframeCompositionHtml } from '../../../../shared/editframeComposition';

describe('buildEditframeCompositionHtml', () => {
  it('emits explicit root dimensions and ordered visual scenes', () => {
    const result = buildEditframeCompositionHtml(
      [
        {
          id: 'shot-2',
          type: 'video',
          url: 'https://media.example.com/shot-2.mp4',
          orderIndex: 2,
          durationMs: 3000,
          trimStartMs: 500,
          trimEndMs: 2500,
          metadata: { start_ms: 7000 },
        },
        {
          id: 'shot-1',
          type: 'image',
          url: 'https://media.example.com/shot-1.png',
          orderIndex: 1,
          durationMs: 5000,
        },
      ],
      { width: 1280, height: 720, fps: 24, compositionId: 'test-composition' }
    );

    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.fps).toBe(24);
    expect(result.durationMs).toBe(10000);
    expect(result.html).toContain('id="test-composition"');
    expect(result.html).toContain('style="width:1280px;height:720px;background:#000000"');
    expect(result.html.indexOf('shot-1')).toBeLessThan(result.html.indexOf('shot-2'));
    expect(result.html).toContain('sourcein="0.5s"');
    expect(result.html).toContain('sourceout="2.5s"');
  });

  it('adds independently timed audio layers with volume and an empty visual fallback', () => {
    const result = buildEditframeCompositionHtml([
      {
        id: 'music-1',
        type: 'audio',
        url: 'https://media.example.com/music.mp3',
        durationMs: 12000,
        startMs: 2000,
        volume: 0.35,
      },
    ]);

    expect(result.durationMs).toBe(14000);
    expect(result.html).toContain('width:1920px;height:1080px');
    expect(result.html).toContain('offset="2s"');
    expect(result.html).toContain('volume="0.35"');
    expect(result.html).toContain('<ef-audio src="https://media.example.com/music.mp3"');
  });

  it('serializes layered text, transforms, transitions, and deterministic effects', () => {
    const result = buildEditframeCompositionHtml(
      [
        {
          id: 'title-1',
          type: 'text',
          text: 'WZRD Cut',
          startMs: 1000,
          durationMs: 2500,
          layer: 4,
          transforms: {
            position: { x: 120, y: -80 },
            scale: { x: 1.2, y: 1.2 },
            rotation: 6,
            opacity: 0.85,
          },
          style: {
            fontFamily: 'Inter',
            fontSize: 96,
            fontWeight: '800',
            color: '#f97316',
            textAlign: 'center',
          },
          effects: [{ id: 'blur', params: { radius: 3 } }],
          transition: { type: 'fade', duration: 400 },
        },
      ],
      { width: 1920, height: 1080, fps: 30, compositionId: 'layered-test' }
    );

    expect(result.durationMs).toBe(5000);
    expect(result.html).toContain('<ef-text');
    expect(result.html).toContain('WZRD Cut');
    expect(result.html).toContain('translate(120px, -80px)');
    expect(result.html).toContain('rotate(6deg)');
    expect(result.html).toContain('opacity: 0.85');
    expect(result.html).toContain('filter: blur(3px)');
    expect(result.html).toContain('wzrd-transition-fade');
    expect(result.html).toContain('@keyframes wzrd-fade-in');
  });
});
