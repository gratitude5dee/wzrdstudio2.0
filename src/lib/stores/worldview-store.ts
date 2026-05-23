import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  CameraSettings,
  CameraTransform,
  CharacterRef,
  GeneratedImage,
  GeneratedShot,
  GenerationModel,
  ShotStatus,
  TakeStatus,
  World,
  WorldviewMode,
  WorldviewScene,
  WorldviewState,
  WorldviewTake,
} from '@/types/worldview';
import { LENS_OPTIONS } from '@/types/worldview';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CAMERA: CameraSettings = {
  lens: '35mm',
  aperture: 'f/1.8',
  aspectRatio: '16:9',
  zoom: 100,
};

const DEFAULT_CAMERA_TRANSFORM: CameraTransform = {
  position: { x: 0, y: 1.6, z: 3 },
  rotation: { x: 0, y: 0, z: 0 },
  fov: 63,
};

const initialState: WorldviewState = {
  mode: 'canvas',
  scenes: [],
  activeSceneId: null,
  worlds: [],
  activeWorldId: null,
  activeTakeId: null,
  characters: [],
  camera: { ...DEFAULT_CAMERA },
  cameraTransform: { ...DEFAULT_CAMERA_TRANSFORM },
  motionEnabled: false,
  capturing: false,
  generatingShot: false,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface WorldviewActions {
  // Mode
  setMode: (mode: WorldviewMode) => void;

  // Scenes
  addScene: (name?: string) => string;
  removeScene: (id: string) => void;
  setActiveScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;

  // Per-scene UI state
  setSceneGenerationError: (sceneId: string, error: string | null) => void;
  setSceneShowCreator: (sceneId: string, show: boolean) => void;

  // Worlds
  addWorld: (world: World) => void;
  setActiveWorld: (id: string | null) => void;
  setWorldGenerating: (worldId: string, generating: boolean) => void;
  assignWorldToScene: (sceneId: string, worldId: string) => void;

  // Camera
  updateCamera: (updates: Partial<CameraSettings>) => void;
  updateCameraTransform: (updates: Partial<CameraTransform>) => void;
  resetCamera: () => void;

  // Takes
  addTake: (take: WorldviewTake) => void;
  updateTakeStatus: (takeId: string, status: TakeStatus) => void;
  setActiveTake: (id: string | null) => void;
  removeTake: (takeId: string) => void;

  // Generated Shots
  addGeneratedShot: (shot: GeneratedShot) => void;
  updateShotStatus: (shotId: string, status: ShotStatus) => void;
  addShotResults: (shotId: string, images: GeneratedImage[]) => void;

  // Characters
  addCharacter: (character: CharacterRef) => void;
  removeCharacter: (id: string) => void;

  // Flags
  setCapturing: (capturing: boolean) => void;
  setGeneratingShot: (generating: boolean) => void;
  toggleMotion: () => void;

  // Reset
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorldviewStore = create<WorldviewState & WorldviewActions>()(
  devtools((set, get) => ({
    ...initialState,

    // -- Mode ---------------------------------------------------------------

    setMode: (mode) => set({ mode }, false, 'setMode'),

    // -- Scenes -------------------------------------------------------------

    addScene: (name) => {
      const id = crypto.randomUUID();
      const scene: WorldviewScene = {
        id,
        name: name ?? `Scene ${get().scenes.length + 1}`,
        takes: [],
        generatedShots: [],
        createdAt: new Date().toISOString(),
        generationError: null,
        showCreator: false,
      };
      set(
        (state) => ({
          scenes: [...state.scenes, scene],
          activeSceneId: id,
        }),
        false,
        'addScene',
      );
      return id;
    },

    removeScene: (id) =>
      set((state) => {
        const remaining = state.scenes.filter((s) => s.id !== id);
        let nextActive = state.activeSceneId;
        if (state.activeSceneId === id) {
          nextActive = remaining.length > 0 ? remaining[0].id : null;
        }
        return { scenes: remaining, activeSceneId: nextActive };
      }, false, 'removeScene'),

    setActiveScene: (id) => set({ activeSceneId: id }, false, 'setActiveScene'),

    renameScene: (id, name) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) => (s.id === id ? { ...s, name } : s)),
        }),
        false,
        'renameScene',
      ),

    // -- Per-scene UI state -------------------------------------------------

    setSceneGenerationError: (sceneId, error) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) =>
            s.id === sceneId ? { ...s, generationError: error } : s,
          ),
        }),
        false,
        'setSceneGenerationError',
      ),

    setSceneShowCreator: (sceneId, show) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) =>
            s.id === sceneId ? { ...s, showCreator: show } : s,
          ),
        }),
        false,
        'setSceneShowCreator',
      ),

    // -- Worlds -------------------------------------------------------------

    addWorld: (world) =>
      set(
        (state) => ({ worlds: [...state.worlds, world] }),
        false,
        'addWorld',
      ),

    setActiveWorld: (id) => set({ activeWorldId: id }, false, 'setActiveWorld'),

    setWorldGenerating: (_worldId, _generating) => {
      // This flag is tracked per-world via WorldOperation status externally.
      // Intentionally a no-op on the store; kept for API consistency.
    },

    assignWorldToScene: (sceneId, worldId) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) =>
            s.id === sceneId ? { ...s, worldId } : s,
          ),
        }),
        false,
        'assignWorldToScene',
      ),

    // -- Camera -------------------------------------------------------------

    updateCamera: (updates) =>
      set(
        (state) => ({
          camera: { ...state.camera, ...updates },
          // Sync FOV when lens changes
          ...(updates.lens
            ? {
                cameraTransform: {
                  ...state.cameraTransform,
                  fov:
                    LENS_OPTIONS.find((l) => l.value === updates.lens)?.fov ??
                    state.cameraTransform.fov,
                },
              }
            : {}),
        }),
        false,
        'updateCamera',
      ),

    updateCameraTransform: (updates) =>
      set(
        (state) => ({
          cameraTransform: { ...state.cameraTransform, ...updates },
        }),
        false,
        'updateCameraTransform',
      ),

    resetCamera: () =>
      set(
        {
          camera: { ...DEFAULT_CAMERA },
          cameraTransform: { ...DEFAULT_CAMERA_TRANSFORM },
        },
        false,
        'resetCamera',
      ),

    // -- Takes --------------------------------------------------------------

    addTake: (take) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) =>
            s.id === take.sceneId
              ? { ...s, takes: [...s.takes, take] }
              : s,
          ),
        }),
        false,
        'addTake',
      ),

    updateTakeStatus: (takeId, status) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) => ({
            ...s,
            takes: s.takes.map((t) =>
              t.id === takeId ? { ...t, status } : t,
            ),
          })),
        }),
        false,
        'updateTakeStatus',
      ),

    setActiveTake: (id) => set({ activeTakeId: id }, false, 'setActiveTake'),

    removeTake: (takeId) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) => ({
            ...s,
            takes: s.takes.filter((t) => t.id !== takeId),
          })),
          activeTakeId:
            state.activeTakeId === takeId ? null : state.activeTakeId,
        }),
        false,
        'removeTake',
      ),

    // -- Generated Shots ----------------------------------------------------

    addGeneratedShot: (shot) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) =>
            s.id === shot.sceneId
              ? { ...s, generatedShots: [...s.generatedShots, shot] }
              : s,
          ),
        }),
        false,
        'addGeneratedShot',
      ),

    updateShotStatus: (shotId, status) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) => ({
            ...s,
            generatedShots: s.generatedShots.map((gs) =>
              gs.id === shotId ? { ...gs, status } : gs,
            ),
          })),
        }),
        false,
        'updateShotStatus',
      ),

    addShotResults: (shotId, images) =>
      set(
        (state) => ({
          scenes: state.scenes.map((s) => ({
            ...s,
            generatedShots: s.generatedShots.map((gs) =>
              gs.id === shotId
                ? { ...gs, images, status: 'completed' as const }
                : gs,
            ),
          })),
        }),
        false,
        'addShotResults',
      ),

    // -- Characters ---------------------------------------------------------

    addCharacter: (character) =>
      set(
        (state) => ({ characters: [...state.characters, character] }),
        false,
        'addCharacter',
      ),

    removeCharacter: (id) =>
      set(
        (state) => ({
          characters: state.characters.filter((c) => c.id !== id),
        }),
        false,
        'removeCharacter',
      ),

    // -- Flags --------------------------------------------------------------

    setCapturing: (capturing) => set({ capturing }, false, 'setCapturing'),

    setGeneratingShot: (generating) =>
      set({ generatingShot: generating }, false, 'setGeneratingShot'),

    toggleMotion: () =>
      set(
        (state) => ({ motionEnabled: !state.motionEnabled }),
        false,
        'toggleMotion',
      ),

    // -- Reset --------------------------------------------------------------

    reset: () => set({ ...initialState }, false, 'reset'),
  })),
);
