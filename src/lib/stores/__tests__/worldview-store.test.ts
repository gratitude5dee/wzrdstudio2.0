import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldviewStore } from '@/lib/stores/worldview-store';
import type { WorldviewTake, GeneratedShot } from '@/types/worldview';

// Reset store before each test to avoid cross-test contamination
beforeEach(() => {
  useWorldviewStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

describe('setMode', () => {
  it('defaults to canvas mode', () => {
    expect(useWorldviewStore.getState().mode).toBe('canvas');
  });

  it('switches between modes', () => {
    const { setMode } = useWorldviewStore.getState();
    setMode('world-viewer');
    expect(useWorldviewStore.getState().mode).toBe('world-viewer');
    setMode('shot-composer');
    expect(useWorldviewStore.getState().mode).toBe('shot-composer');
    setMode('canvas');
    expect(useWorldviewStore.getState().mode).toBe('canvas');
  });
});

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

describe('addScene', () => {
  it('creates a scene with a unique ID and sets it active', () => {
    const id = useWorldviewStore.getState().addScene();
    const state = useWorldviewStore.getState();
    expect(state.scenes).toHaveLength(1);
    expect(state.scenes[0].id).toBe(id);
    expect(state.activeSceneId).toBe(id);
  });

  it('assigns sequential default names', () => {
    const { addScene } = useWorldviewStore.getState();
    addScene();
    addScene();
    const names = useWorldviewStore.getState().scenes.map((s) => s.name);
    expect(names).toEqual(['Scene 1', 'Scene 2']);
  });

  it('uses the provided name', () => {
    useWorldviewStore.getState().addScene('My Scene');
    expect(useWorldviewStore.getState().scenes[0].name).toBe('My Scene');
  });

  it('initialises takes and generatedShots as empty arrays', () => {
    useWorldviewStore.getState().addScene();
    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.takes).toEqual([]);
    expect(scene.generatedShots).toEqual([]);
  });

  it('initialises generationError as null and showCreator as false', () => {
    useWorldviewStore.getState().addScene();
    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.generationError).toBeNull();
    expect(scene.showCreator).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-scene UI state
// ---------------------------------------------------------------------------

describe('setSceneGenerationError', () => {
  it('sets a generation error on the target scene', () => {
    const id = useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().setSceneGenerationError(id, 'API key missing');
    const scene = useWorldviewStore.getState().scenes.find((s) => s.id === id);
    expect(scene?.generationError).toBe('API key missing');
  });

  it('clears the generation error when set to null', () => {
    const id = useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().setSceneGenerationError(id, 'some error');
    useWorldviewStore.getState().setSceneGenerationError(id, null);
    const scene = useWorldviewStore.getState().scenes.find((s) => s.id === id);
    expect(scene?.generationError).toBeNull();
  });

  it('does not affect other scenes', () => {
    const idA = useWorldviewStore.getState().addScene('Scene A');
    const idB = useWorldviewStore.getState().addScene('Scene B');
    useWorldviewStore.getState().setSceneGenerationError(idA, 'error A');
    const sceneB = useWorldviewStore.getState().scenes.find((s) => s.id === idB);
    expect(sceneB?.generationError).toBeNull();
  });
});

describe('setSceneShowCreator', () => {
  it('sets showCreator to true on the target scene', () => {
    const id = useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().setSceneShowCreator(id, true);
    const scene = useWorldviewStore.getState().scenes.find((s) => s.id === id);
    expect(scene?.showCreator).toBe(true);
  });

  it('sets showCreator back to false', () => {
    const id = useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().setSceneShowCreator(id, true);
    useWorldviewStore.getState().setSceneShowCreator(id, false);
    const scene = useWorldviewStore.getState().scenes.find((s) => s.id === id);
    expect(scene?.showCreator).toBe(false);
  });

  it('does not affect other scenes', () => {
    const idA = useWorldviewStore.getState().addScene('Scene A');
    const idB = useWorldviewStore.getState().addScene('Scene B');
    useWorldviewStore.getState().setSceneShowCreator(idA, true);
    const sceneB = useWorldviewStore.getState().scenes.find((s) => s.id === idB);
    expect(sceneB?.showCreator).toBe(false);
  });
});

describe('removeScene', () => {
  it('deletes a scene', () => {
    const id = useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().removeScene(id);
    expect(useWorldviewStore.getState().scenes).toHaveLength(0);
  });

  it('activates another scene when the active one is deleted', () => {
    const id1 = useWorldviewStore.getState().addScene('A');
    const id2 = useWorldviewStore.getState().addScene('B');
    // id2 is now active
    expect(useWorldviewStore.getState().activeSceneId).toBe(id2);
    useWorldviewStore.getState().removeScene(id2);
    expect(useWorldviewStore.getState().activeSceneId).toBe(id1);
  });

  it('sets activeSceneId to null when last scene is removed', () => {
    const id = useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().removeScene(id);
    expect(useWorldviewStore.getState().activeSceneId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

describe('updateCamera', () => {
  it('defaults to 35mm, f/1.8, 16:9, 100% zoom', () => {
    const { camera } = useWorldviewStore.getState();
    expect(camera).toEqual({
      lens: '35mm',
      aperture: 'f/1.8',
      aspectRatio: '16:9',
      zoom: 100,
    });
  });

  it('partially updates camera settings', () => {
    useWorldviewStore.getState().updateCamera({ zoom: 150 });
    expect(useWorldviewStore.getState().camera.zoom).toBe(150);
    expect(useWorldviewStore.getState().camera.lens).toBe('35mm'); // unchanged
  });

  it('syncs FOV when lens changes', () => {
    useWorldviewStore.getState().updateCamera({ lens: '24mm' });
    expect(useWorldviewStore.getState().cameraTransform.fov).toBe(84);
  });
});

describe('resetCamera', () => {
  it('resets camera to default values', () => {
    useWorldviewStore.getState().updateCamera({ lens: '85mm', zoom: 200 });
    useWorldviewStore.getState().updateCameraTransform({
      position: { x: 5, y: 5, z: 5 },
    });
    useWorldviewStore.getState().resetCamera();

    const { camera, cameraTransform } = useWorldviewStore.getState();
    expect(camera).toEqual({
      lens: '35mm',
      aperture: 'f/1.8',
      aspectRatio: '16:9',
      zoom: 100,
    });
    expect(cameraTransform).toEqual({
      position: { x: 0, y: 1.6, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      fov: 63,
    });
  });
});

// ---------------------------------------------------------------------------
// Takes (nested inside scenes)
// ---------------------------------------------------------------------------

describe('addTake', () => {
  it('adds a take to the matching scene', () => {
    const sceneId = useWorldviewStore.getState().addScene();
    const take: WorldviewTake = {
      id: 'take-1',
      sceneId,
      imageUrl: 'https://example.com/take.png',
      camera: useWorldviewStore.getState().camera,
      cameraTransform: useWorldviewStore.getState().cameraTransform,
      status: 'ready',
      createdAt: new Date().toISOString(),
    };
    useWorldviewStore.getState().addTake(take);

    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.takes).toHaveLength(1);
    expect(scene.takes[0].id).toBe('take-1');
  });
});

// ---------------------------------------------------------------------------
// Generated Shots (nested inside scenes)
// ---------------------------------------------------------------------------

describe('addGeneratedShot', () => {
  it('adds a generated shot to the matching scene', () => {
    const sceneId = useWorldviewStore.getState().addScene();
    const shot: GeneratedShot = {
      id: 'shot-1',
      sceneId,
      prompt: 'a beautiful world',
      model: 'nano-banana',
      status: 'pending',
      images: [],
      createdAt: new Date().toISOString(),
    };
    useWorldviewStore.getState().addGeneratedShot(shot);

    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.generatedShots).toHaveLength(1);
    expect(scene.generatedShots[0].id).toBe('shot-1');
  });
});

// ---------------------------------------------------------------------------
// Capturing flag
// ---------------------------------------------------------------------------

describe('setCapturing', () => {
  it('sets capturing to true', () => {
    expect(useWorldviewStore.getState().capturing).toBe(false);
    useWorldviewStore.getState().setCapturing(true);
    expect(useWorldviewStore.getState().capturing).toBe(true);
  });

  it('sets capturing back to false', () => {
    useWorldviewStore.getState().setCapturing(true);
    useWorldviewStore.getState().setCapturing(false);
    expect(useWorldviewStore.getState().capturing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Camera transform
// ---------------------------------------------------------------------------

describe('updateCameraTransform', () => {
  it('partially updates camera transform rotation', () => {
    useWorldviewStore.getState().updateCameraTransform({
      rotation: { x: 0.5, y: -0.3, z: 0 },
    });
    const { cameraTransform } = useWorldviewStore.getState();
    expect(cameraTransform.rotation).toEqual({ x: 0.5, y: -0.3, z: 0 });
    // position should remain default
    expect(cameraTransform.position).toEqual({ x: 0, y: 1.6, z: 3 });
  });

  it('partially updates camera transform position', () => {
    useWorldviewStore.getState().updateCameraTransform({
      position: { x: 1, y: 2, z: 3 },
    });
    const { cameraTransform } = useWorldviewStore.getState();
    expect(cameraTransform.position).toEqual({ x: 1, y: 2, z: 3 });
  });
});

// ---------------------------------------------------------------------------
// Take status updates
// ---------------------------------------------------------------------------

describe('updateTakeStatus', () => {
  it('updates take status from capturing to ready', () => {
    const sceneId = useWorldviewStore.getState().addScene();
    const take: WorldviewTake = {
      id: 'take-status-1',
      sceneId,
      imageUrl: '',
      camera: useWorldviewStore.getState().camera,
      cameraTransform: useWorldviewStore.getState().cameraTransform,
      status: 'capturing',
      createdAt: new Date().toISOString(),
    };
    useWorldviewStore.getState().addTake(take);
    useWorldviewStore.getState().updateTakeStatus('take-status-1', 'ready');
    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.takes[0].status).toBe('ready');
  });

  it('updates take status to failed', () => {
    const sceneId = useWorldviewStore.getState().addScene();
    const take: WorldviewTake = {
      id: 'take-fail-1',
      sceneId,
      imageUrl: '',
      camera: useWorldviewStore.getState().camera,
      cameraTransform: useWorldviewStore.getState().cameraTransform,
      status: 'capturing',
      createdAt: new Date().toISOString(),
    };
    useWorldviewStore.getState().addTake(take);
    useWorldviewStore.getState().updateTakeStatus('take-fail-1', 'failed');
    const scene = useWorldviewStore.getState().scenes[0];
    expect(scene.takes[0].status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// Motion toggle
// ---------------------------------------------------------------------------

describe('toggleMotion', () => {
  it('toggles motionEnabled from false to true and back', () => {
    expect(useWorldviewStore.getState().motionEnabled).toBe(false);
    useWorldviewStore.getState().toggleMotion();
    expect(useWorldviewStore.getState().motionEnabled).toBe(true);
    useWorldviewStore.getState().toggleMotion();
    expect(useWorldviewStore.getState().motionEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Active Take
// ---------------------------------------------------------------------------

describe('setActiveTake', () => {
  it('sets activeTakeId', () => {
    useWorldviewStore.getState().setActiveTake('take-42');
    expect(useWorldviewStore.getState().activeTakeId).toBe('take-42');
  });

  it('clears activeTakeId when set to null', () => {
    useWorldviewStore.getState().setActiveTake('take-42');
    useWorldviewStore.getState().setActiveTake(null);
    expect(useWorldviewStore.getState().activeTakeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generating Shot flag
// ---------------------------------------------------------------------------

describe('setGeneratingShot', () => {
  it('sets generatingShot to true', () => {
    expect(useWorldviewStore.getState().generatingShot).toBe(false);
    useWorldviewStore.getState().setGeneratingShot(true);
    expect(useWorldviewStore.getState().generatingShot).toBe(true);
  });

  it('sets generatingShot back to false', () => {
    useWorldviewStore.getState().setGeneratingShot(true);
    useWorldviewStore.getState().setGeneratingShot(false);
    expect(useWorldviewStore.getState().generatingShot).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

describe('addCharacter', () => {
  it('adds a character to the characters array', () => {
    useWorldviewStore.getState().addCharacter({ id: 'char-1', name: 'Alice', imageUrl: 'https://example.com/alice.png' });
    expect(useWorldviewStore.getState().characters).toHaveLength(1);
    expect(useWorldviewStore.getState().characters[0].name).toBe('Alice');
  });
});

describe('removeCharacter', () => {
  it('removes a character by ID', () => {
    useWorldviewStore.getState().addCharacter({ id: 'char-1', name: 'Alice' });
    useWorldviewStore.getState().addCharacter({ id: 'char-2', name: 'Bob' });
    useWorldviewStore.getState().removeCharacter('char-1');
    expect(useWorldviewStore.getState().characters).toHaveLength(1);
    expect(useWorldviewStore.getState().characters[0].name).toBe('Bob');
  });
});

// ---------------------------------------------------------------------------
// Shot results
// ---------------------------------------------------------------------------

describe('addShotResults', () => {
  it('adds images to an existing shot and marks it completed', () => {
    const sceneId = useWorldviewStore.getState().addScene();
    const shot: GeneratedShot = {
      id: 'shot-res-1',
      sceneId,
      prompt: 'test',
      model: 'nano-banana',
      status: 'generating',
      images: [],
      createdAt: new Date().toISOString(),
    };
    useWorldviewStore.getState().addGeneratedShot(shot);
    useWorldviewStore.getState().addShotResults('shot-res-1', [
      { url: 'https://example.com/img.png', width: 1024, height: 576 },
    ]);
    const scene = useWorldviewStore.getState().scenes[0];
    const updatedShot = scene.generatedShots[0];
    expect(updatedShot.status).toBe('completed');
    expect(updatedShot.images).toHaveLength(1);
    expect(updatedShot.images[0].url).toBe('https://example.com/img.png');
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe('reset', () => {
  it('restores the store to initial state', () => {
    useWorldviewStore.getState().addScene();
    useWorldviewStore.getState().setMode('world-viewer');
    useWorldviewStore.getState().updateCamera({ zoom: 200 });
    useWorldviewStore.getState().reset();

    const state = useWorldviewStore.getState();
    expect(state.mode).toBe('canvas');
    expect(state.scenes).toHaveLength(0);
    expect(state.camera.zoom).toBe(100);
  });
});
