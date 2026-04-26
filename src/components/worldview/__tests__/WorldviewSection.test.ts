import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldviewStore } from '@/lib/stores/worldview-store';
import { normalizeStudioParam, KANVAS_STUDIO_ORDER, KANVAS_STUDIO_META } from '@/features/kanvas/helpers';

beforeEach(() => {
  useWorldviewStore.getState().reset();
});

// ---------------------------------------------------------------------------
// KanvasStudio integration
// ---------------------------------------------------------------------------

describe('worldview studio integration', () => {
  it('KANVAS_STUDIO_ORDER includes worldview', () => {
    expect(KANVAS_STUDIO_ORDER).toContain('worldview');
  });

  it('KANVAS_STUDIO_META has worldview entry with label, headline, description', () => {
    const meta = KANVAS_STUDIO_META.worldview;
    expect(meta).toBeDefined();
    expect(meta.label).toBe('Worldview');
    expect(meta.headline).toBe('Worldview Studio');
    expect(meta.description).toBe('Generate 3D worlds, capture takes, and compose AI shots.');
  });

  it('normalizeStudioParam accepts worldview', () => {
    expect(normalizeStudioParam('worldview')).toBe('worldview');
  });

  it('normalizeStudioParam still defaults unknown to image', () => {
    expect(normalizeStudioParam('invalid')).toBe('image');
    expect(normalizeStudioParam(null)).toBe('image');
    expect(normalizeStudioParam(undefined)).toBe('image');
  });
});

// ---------------------------------------------------------------------------
// Scene management (WorldviewSection depends on these store actions)
// ---------------------------------------------------------------------------

describe('scene management for WorldviewSection', () => {
  it('addScene creates a scene chip with amber highlight (activeSceneId is set)', () => {
    const id = useWorldviewStore.getState().addScene();
    const state = useWorldviewStore.getState();
    expect(state.scenes).toHaveLength(1);
    expect(state.activeSceneId).toBe(id);
  });

  it('scene chips can be clicked to switch active scene', () => {
    const id1 = useWorldviewStore.getState().addScene('Scene A');
    const id2 = useWorldviewStore.getState().addScene('Scene B');
    expect(useWorldviewStore.getState().activeSceneId).toBe(id2);
    useWorldviewStore.getState().setActiveScene(id1);
    expect(useWorldviewStore.getState().activeSceneId).toBe(id1);
  });

  it('multiple scenes exist for horizontal scrolling', () => {
    for (let i = 0; i < 8; i++) {
      useWorldviewStore.getState().addScene();
    }
    expect(useWorldviewStore.getState().scenes).toHaveLength(8);
  });

  it('empty scene has no worldId (shows Create a 3D World CTA)', () => {
    useWorldviewStore.getState().addScene();
    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.worldId).toBeUndefined();
  });

  it('scene deletion removes chip and activates another scene', () => {
    const id1 = useWorldviewStore.getState().addScene('A');
    const id2 = useWorldviewStore.getState().addScene('B');
    useWorldviewStore.getState().removeScene(id2);
    expect(useWorldviewStore.getState().scenes).toHaveLength(1);
    expect(useWorldviewStore.getState().activeSceneId).toBe(id1);
  });

  it('mode switching uses AnimatePresence mode wait pattern', () => {
    const { setMode } = useWorldviewStore.getState();
    setMode('canvas');
    expect(useWorldviewStore.getState().mode).toBe('canvas');
    setMode('world-viewer');
    expect(useWorldviewStore.getState().mode).toBe('world-viewer');
    setMode('shot-composer');
    expect(useWorldviewStore.getState().mode).toBe('shot-composer');
  });

  it('world assignment to scene works correctly', () => {
    const sceneId = useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().addWorld({
      id: 'world-1',
      displayName: 'Test World',
      model: 'Marble 0.1-plus',
      prompt: { kind: 'text', text: 'A forest' },
      assets: {},
      createdAt: new Date().toISOString(),
    });
    useWorldviewStore.getState().assignWorldToScene(sceneId, 'world-1');
    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.worldId).toBe('world-1');
  });
});
