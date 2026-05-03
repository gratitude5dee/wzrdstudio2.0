import { describe, expect, it } from 'vitest';
import { buildEditframeCompositionHtml } from '../../../../shared/editframeComposition';
import { buildLayeredEditframeAssets } from './exportFixtures';

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

  it('matches the layered image/video/text/audio golden fixture', () => {
    const result = buildEditframeCompositionHtml(
      buildLayeredEditframeAssets(),
      { width: 1920, height: 1080, fps: 30, compositionId: 'golden-layered' }
    );

    const normalizedHtml = result.html.replace(/<style>[\s\S]*<\/style>$/, '<style>[stylesheet]</style>');
    expect(normalizedHtml).toMatchInlineSnapshot(`
      "<ef-configuration api-host="https://editframe.com"><ef-timegroup id="golden-layered" mode="contain" duration="7s" fps="30" class="relative overflow-hidden bg-black" style="width:1920px;height:1080px;background:#000000"><ef-timegroup mode="fixed" offset="0s" duration="6s" data-asset-id="background" data-role="image" data-layer="0" class="absolute inset-0 h-full w-full overflow-hidden" style="background:#000000;z-index:1;"><ef-image src="https://media.example.com/background.jpg" duration="6s" class="absolute inset-0 size-full object-cover" style="transform: translate(0px, 0px) scale(1.08, 1.08) rotate(0deg); transform-origin: center center; opacity: 0.9; filter: saturate(118%);"></ef-image><!-- image --></ef-timegroup><ef-timegroup mode="fixed" offset="0.5s" duration="2.2s" data-asset-id="caption" data-role="text" data-layer="5" class="absolute inset-0 h-full w-full overflow-hidden wzrd-transition wzrd-transition-fade" style="background:#000000;z-index:6;--wzrd-transition-duration:350ms;"><ef-text duration="2.2s" split="word" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 wzrd-text" style="transform: translate(0px, 0px) scale(1, 1) rotate(0deg); transform-origin: center center; opacity: 1; font-family:&quot;Inter&quot;; font-size:76px; font-weight:700; color:#f97316; background:transparent; text-align:center; line-height:1.08; padding:0.25em 0.35em; max-width:90%; filter: blur(2px);">Layered export</ef-text><!-- text --></ef-timegroup><ef-timegroup mode="fixed" offset="1.2s" duration="3.2s" data-asset-id="foreground-video" data-role="video" data-layer="2" class="absolute inset-0 h-full w-full overflow-hidden wzrd-transition wzrd-transition-zoom" style="background:#000000;z-index:3;--wzrd-transition-duration:500ms;"><ef-video src="https://media.example.com/foreground.mp4" sourcein="0.5s" sourceout="3.7s" class="absolute inset-0 size-full object-cover" style="transform: translate(140px, 44px) scale(0.62, 0.62) rotate(4deg); transform-origin: center center; opacity: 0.88;"></ef-video><!-- video --></ef-timegroup><ef-timegroup mode="fixed" offset="0s" duration="7s" data-asset-id="music" data-role="music"><ef-audio src="https://media.example.com/music.mp3" sourcein="1s" sourceout="8s" data-fade-in-ms="600" data-fade-out-ms="900" volume="0.42"></ef-audio></ef-timegroup></ef-timegroup></ef-configuration><style>[stylesheet]</style>"
    `);
  });
});
