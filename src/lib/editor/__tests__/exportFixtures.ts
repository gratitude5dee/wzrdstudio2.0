import type { ExportAsset } from '../../../../supabase/functions/_shared/export-helpers';
import type { EditframeCompositionAsset } from '../../../../shared/editframeComposition';

export function buildMixedDirectorCutExportAssets(): ExportAsset[] {
  return [
    {
      id: 'shot-image-1',
      type: 'image',
      subtype: 'visual',
      url: 'https://media.example.com/shot-1.png',
      duration_ms: 4200,
      order_index: 0,
      metadata: {
        name: 'Opening still',
        start_ms: 0,
        transforms: { position: { x: 0, y: 0 }, scale: { x: 1.05, y: 1.05 }, opacity: 0.92 },
        effects: [{ id: 'brightness', params: { value: 108 } }],
        transition: { type: 'dissolve', duration: 450 },
      },
    },
    {
      id: 'shot-video-2',
      type: 'video',
      subtype: 'visual',
      url: 'https://media.example.com/shot-2.mp4',
      duration_ms: 5200,
      order_index: 1,
      metadata: {
        name: 'Tracking shot',
        start_ms: 4200,
        trim_start_ms: 800,
        trim_end_ms: 6000,
        transforms: { position: { x: 22, y: -16 }, scale: { x: 0.96, y: 0.96 }, rotation: -2, opacity: 1 },
        effects: [{ id: 'contrast', params: { value: 112 } }],
        transition: { type: 'slide', duration: 300, direction: 'left' },
      },
    },
    {
      id: 'title-text-1',
      type: 'text',
      subtype: 'text',
      duration_ms: 2400,
      order_index: 2,
      metadata: {
        text: 'Director\'s Cut',
        start_ms: 900,
        layer: 4,
        style: { fontFamily: 'Inter', fontSize: 92, fontWeight: '800', color: '#ffffff' },
        transition: { type: 'fade', duration: 300 },
      },
    },
    {
      id: 'narration-1',
      type: 'audio',
      subtype: 'voiceover',
      url: 'https://media.example.com/narration.mp3',
      duration_ms: 8000,
      order_index: 3,
      metadata: {
        start_ms: 0,
        trim_start_ms: 250,
        trim_end_ms: 8250,
        volume: 0.84,
        fade_in_ms: 300,
        fade_out_ms: 500,
      },
    },
  ];
}

export function buildLayeredEditframeAssets(): EditframeCompositionAsset[] {
  return [
    {
      id: 'background',
      type: 'image',
      url: 'https://media.example.com/background.jpg',
      startMs: 0,
      durationMs: 6000,
      layer: 0,
      transforms: { scale: { x: 1.08, y: 1.08 }, opacity: 0.9 },
      effects: [{ id: 'saturation', params: { value: 118 } }],
    },
    {
      id: 'foreground-video',
      type: 'video',
      url: 'https://media.example.com/foreground.mp4',
      startMs: 1200,
      durationMs: 3200,
      trimStartMs: 500,
      trimEndMs: 3700,
      layer: 2,
      transforms: { position: { x: 140, y: 44 }, scale: { x: 0.62, y: 0.62 }, rotation: 4, opacity: 0.88 },
      transition: { type: 'zoom', duration: 500 },
    },
    {
      id: 'caption',
      type: 'text',
      text: 'Layered export',
      startMs: 500,
      durationMs: 2200,
      layer: 5,
      style: { fontFamily: 'Inter', fontSize: 76, fontWeight: '700', color: '#f97316' },
      effects: [{ id: 'blur', params: { radius: 2 } }],
      transition: { type: 'fade', duration: 350 },
    },
    {
      id: 'music',
      type: 'audio',
      url: 'https://media.example.com/music.mp3',
      startMs: 0,
      durationMs: 7000,
      trimStartMs: 1000,
      trimEndMs: 8000,
      volume: 0.42,
      fadeInMs: 600,
      fadeOutMs: 900,
      role: 'music',
    },
  ];
}
