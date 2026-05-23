import { create } from 'zustand';
import {
  deleteTimelineSelection,
  duplicateTimelineSelection,
  moveTimelineSelection,
  splitClipAtTime as splitTimelineClipAtTime,
} from '@/lib/editor/timelineCommands';
import { isDevAuthBypassEnabled } from '@/lib/devAuthBypass';
import { videoEditorService } from '@/services/videoEditorService';

export interface ProjectMetadata {
  id: string | null;
  name: string;
  duration: number;
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  transforms: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
  };
}

export interface ClipTransition {
  type: 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'blur' | 'none';
  duration: number; // ms
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface ClipEffect {
  id: string;
  name: string;
  type: 'filter' | 'adjustment' | 'overlay';
  params: Record<string, number>;
}

export interface TextClipStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface Clip {
  id: string;
  mediaItemId?: string;
  type: 'video' | 'image' | 'text' | 'element';
  name: string;
  url: string;
  text?: string;
  style?: TextClipStyle;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  mediaMetadata?: Record<string, unknown>;
  sourceId?: string | null;
  startTime: number;
  duration: number;
  endTime?: number;
  trackIndex?: number;
  layer: number;
  trimStart?: number;
  trimEnd?: number;
  transition?: ClipTransition;
  effects?: ClipEffect[];
  transforms: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    opacity: number;
  };
}

export interface AudioTrack {
  id: string;
  mediaItemId?: string;
  type: 'audio';
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  mediaMetadata?: Record<string, unknown>;
  sourceId?: string | null;
  startTime: number;
  duration: number;
  endTime?: number;
  volume: number;
  isMuted: boolean;
  trackIndex?: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export interface CompositionSettings {
  width: number;
  height: number;
  fps: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  duration: number;
  backgroundColor: string;
}

export interface LibraryMediaItem {
  id: string;
  projectId: string;
  mediaType: 'video' | 'image' | 'audio';
  name: string;
  url: string | null;
  durationSeconds?: number;
  sourceType?: 'ai-generated' | 'uploaded' | 'stock';
  status?: 'processing' | 'completed' | 'failed';
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  mediaMetadata?: Record<string, unknown>;
}

// Union type for all media items
export type MediaItem = Clip | AudioTrack;

export interface ClipConnection {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePoint: 'left' | 'right';
  targetPoint: 'left' | 'right';
}

export interface ActiveConnection {
  sourceId: string;
  sourcePoint: 'left' | 'right';
  cursorX: number;
  cursorY: number;
}

export interface Keyframe {
  id: string;
  targetId: string;
  time: number;
  properties: Record<string, unknown>;
  targetType?: 'clip' | 'audio' | 'composition';
  propertyPath?: string;
  easing?: string;
}

export interface GenerationParams {
  prompt: string;
  imageUrl?: string;
  model?: string;
  settings?: Record<string, unknown>;
}

export interface DialogState {
  projectSettings: boolean;
  export: boolean;
  mediaGeneration: boolean;
  mediaLibrary: boolean;
}


export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  volume: number;
  isLooping: boolean;
  inPoint: number;
  outPoint: number;
}

export interface TimelineState {
  zoom: number;
  scrollOffset: number;
  scroll: number;
  snapToGrid: boolean;
  gridSize: number;
}

export interface AIGenerationState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
  lastGeneratedId?: string;
}

export interface VideoEditorState {
  project: ProjectMetadata;
  playback: PlaybackState;
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
  addMediaItem: (item: LibraryMediaItem) => void;
  selectedClipIds: string[];
  selectedAudioTrackIds: string[];
  clipConnections: ClipConnection[];
  activeConnection: ActiveConnection | null;
  keyframes: Keyframe[];
  selectedKeyframeIds: string[];
  dialogs: DialogState;
  generationParams: GenerationParams;
  aiGeneration: AIGenerationState;
  timeline: TimelineState;
  mediaLibrary: {
    items: LibraryMediaItem[];
    isLoading: boolean;
  };
  clipboard: Clip[];
  history: {
    past: HistoryEntry[];
    future: HistoryEntry[];
    maxSize: number;
  };

  setProjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  updateProjectMetadata: (metadata: Partial<Omit<ProjectMetadata, 'id' | 'name'>> & { id?: string | null; name?: string }) => void;

  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  setCurrentTime: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setIsLooping: (isLooping: boolean) => void;
  seek: (time: number) => void;
  setInPoint: (time: number) => void;
  setOutPoint: (time: number) => void;

  addClip: (clip: Clip) => void;
  updateClip: (id: string, updates: Partial<Clip>, options?: { skipHistory?: boolean }) => void;
  removeClip: (id: string) => void;
  removeClipLocal: (id: string) => void;
  syncClipFromRemote: (clip: Clip) => void;
  splitClipAtTime: (id: string, timeMs: number) => boolean;
  moveTimelineItems: (selection: { clipIds?: string[]; audioTrackIds?: string[] }, deltaMs: number) => number;
  deleteTimelineItems: (selection: { clipIds?: string[]; audioTrackIds?: string[] }, options?: { ripple?: boolean }) => number;
  duplicateTimelineItems: (selection: { clipIds?: string[]; audioTrackIds?: string[] }, offsetMs?: number) => number;
  deleteSelectedItems: (options?: { ripple?: boolean }) => number;
  duplicateSelectedItems: (offsetMs?: number) => number;

  addAudioTrack: (track: AudioTrack) => void;
  updateAudioTrack: (id: string, updates: Partial<AudioTrack>, options?: { skipHistory?: boolean }) => void;
  removeAudioTrack: (id: string) => void;
  removeAudioTrackLocal: (id: string) => void;
  syncAudioTrackFromRemote: (track: AudioTrack) => void;

  selectClip: (id: string, addToSelection?: boolean) => void;
  deselectClip: (id: string) => void;
  clearClipSelection: () => void;

  selectAudioTrack: (id: string, addToSelection?: boolean) => void;
  deselectAudioTrack: (id: string) => void;
  clearAudioTrackSelection: () => void;

  addClipConnection: (connection: ClipConnection) => void;
  removeClipConnection: (id: string) => void;
  setActiveConnection: (connection: ActiveConnection | null) => void;
  updateActiveConnectionCursor: (x: number, y: number) => void;

  addKeyframe: (keyframe: Keyframe) => void;
  updateKeyframe: (id: string, updates: Partial<Keyframe>) => void;
  removeKeyframe: (id: string) => void;
  selectKeyframe: (id: string, addToSelection?: boolean) => void;
  deselectKeyframe: (id: string) => void;
  clearKeyframeSelection: () => void;

  openDialog: (dialog: keyof DialogState) => void;
  closeDialog: (dialog: keyof DialogState) => void;
  toggleDialog: (dialog: keyof DialogState) => void;

  setGenerationParams: (params: Partial<GenerationParams>) => void;
  startGeneration: (message?: string) => void;
  updateGenerationProgress: (progress: number, message?: string) => void;
  finishGeneration: (status?: 'completed' | 'failed', message?: string, lastGeneratedId?: string) => void;

  setTimelineZoom: (zoom: number) => void;
  zoomTimelineIn: (step?: number) => void;
  zoomTimelineOut: (step?: number) => void;
  setTimelineScroll: (scroll: number) => void;
  scrollTimelineBy: (delta: number) => void;
  setSnapToGrid: (enabled: boolean) => void;
  nudgeSelectedClips: (deltaMs: number) => void;

  setCompositionSettings: (settings: Partial<CompositionSettings>) => void;
  loadProject: (projectId: string) => Promise<void>;
  loadMediaLibrary: (projectId: string) => Promise<void>;
  setMediaLibraryItems: (items: LibraryMediaItem[]) => void;
  addMediaLibraryItem: (item: LibraryMediaItem) => void;
  updateMediaLibraryItem: (id: string, updates: Partial<LibraryMediaItem>) => void;
  clearMediaLibrary: () => void;
  setMediaLibraryLoading: (isLoading: boolean) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  copySelectedClips: () => void;
  pasteClipboard: () => void;

  reset: () => void;
}

type HistoryEntry = {
  clips: Clip[];
  audioTracks: AudioTrack[];
  keyframes: Keyframe[];
  playback: PlaybackState;
  timeline: TimelineState;
  composition: CompositionSettings;
};

const cloneSlice = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const createHistoryEntry = (state: VideoEditorState): HistoryEntry => ({
  clips: cloneSlice(state.clips),
  audioTracks: cloneSlice(state.audioTracks),
  keyframes: cloneSlice(state.keyframes),
  playback: cloneSlice(state.playback),
  timeline: cloneSlice(state.timeline),
  composition: cloneSlice(state.composition),
});

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const persistEditorTimeline = (state: VideoEditorState) => {
  const projectId = state.project.id;
  if (!projectId) return;
  if (isDevAuthBypassEnabled()) return;

  void videoEditorService
    .saveAllClipsAndTracks(projectId, state.clips, state.audioTracks, state.composition, state.keyframes)
    .catch((error) => {
      console.error('Failed to save editor timeline', error);
    });
};

const initialState: Pick<
  VideoEditorState,
  | 'project'
  | 'playback'
  | 'clips'
  | 'audioTracks'
  | 'composition'
  | 'selectedClipIds'
  | 'selectedAudioTrackIds'
  | 'clipConnections'
  | 'activeConnection'
  | 'keyframes'
  | 'selectedKeyframeIds'
  | 'dialogs'
  | 'generationParams'
  | 'aiGeneration'
  | 'timeline'
  | 'mediaLibrary'
  | 'clipboard'
  | 'history'
> = {
  project: {
    id: null,
    name: 'Untitled Project',
    duration: 0,
    fps: 24,
    resolution: { width: 1920, height: 1080 },
    transforms: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
  },
  playback: {
    isPlaying: false,
    currentTime: 0,
    playbackRate: 1,
    volume: 1,
    isLooping: false,
    inPoint: 0,
    outPoint: 0,
  },
  clips: [],
  audioTracks: [],
  composition: {
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    duration: 0,
    backgroundColor: '#000000',
  },
  selectedClipIds: [],
  selectedAudioTrackIds: [],
  clipConnections: [],
  activeConnection: null,
  keyframes: [],
  selectedKeyframeIds: [],
  dialogs: {
    projectSettings: false,
    export: false,
    mediaGeneration: false,
    mediaLibrary: false,
  },
  generationParams: {
    prompt: '',
    imageUrl: undefined,
    model: 'default',
    settings: {},
  },
  aiGeneration: {
    status: 'idle',
    progress: 0,
    message: undefined,
    lastGeneratedId: undefined,
  },
  timeline: {
    zoom: 50,
    scrollOffset: 0,
    scroll: 0,
    snapToGrid: true,
    gridSize: 100,
  },
  mediaLibrary: {
    items: [],
    isLoading: false,
  },
  clipboard: [],
  history: {
    past: [],
    future: [],
    maxSize: 50,
  },
};

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
  ...initialState,

  setProjectId: (id) =>
    set((state) => ({
      project: { ...state.project, id },
    })),
  setProjectName: (name) =>
    set((state) => ({
      project: { ...state.project, name },
    })),
  updateProjectMetadata: (metadata) =>
    set((state) => ({
      project: {
        ...state.project,
        ...('id' in metadata ? { id: metadata.id ?? state.project.id } : {}),
        ...('name' in metadata ? { name: metadata.name ?? state.project.name } : {}),
        duration: metadata.duration ?? state.project.duration,
        fps: metadata.fps ?? state.project.fps,
        resolution: metadata.resolution
          ? {
              ...state.project.resolution,
              ...metadata.resolution,
            }
          : state.project.resolution,
        transforms: metadata.transforms
          ? {
              position: {
                ...state.project.transforms.position,
                ...(metadata.transforms.position ?? {}),
              },
              scale: {
                ...state.project.transforms.scale,
                ...(metadata.transforms.scale ?? {}),
              },
              rotation: metadata.transforms.rotation ?? state.project.transforms.rotation,
            }
          : state.project.transforms,
      },
    })),

  play: () =>
    set((state) => ({
      playback: { ...state.playback, isPlaying: true },
    })),
  pause: () =>
    set((state) => ({
      playback: { ...state.playback, isPlaying: false },
    })),
  togglePlayPause: () =>
    set((state) => ({
      playback: { ...state.playback, isPlaying: !state.playback.isPlaying },
    })),
  setCurrentTime: (time) =>
    set((state) => ({
      playback: { ...state.playback, currentTime: Math.max(0, time) },
    })),
  seek: (time) =>
    set((state) => ({
      playback: { ...state.playback, currentTime: Math.max(0, time) },
    })),
  setInPoint: (time) =>
    set((state) => ({
      playback: { ...state.playback, inPoint: Math.max(0, time) },
    })),
  setOutPoint: (time) =>
    set((state) => ({
      playback: { ...state.playback, outPoint: Math.max(0, time) },
    })),
  setPlaybackRate: (rate) =>
    set((state) => ({
      playback: { ...state.playback, playbackRate: Math.max(0.1, rate) },
    })),
  setDuration: (duration) =>
    set((state) => ({
      project: { ...state.project, duration: Math.max(0, duration) },
      composition: { ...state.composition, duration: Math.max(0, duration) },
      playback: {
        ...state.playback,
        currentTime: Math.min(state.playback.currentTime, Math.max(0, duration)),
      },
    })),
  setVolume: (volume) =>
    set((state) => ({
      playback: {
        ...state.playback,
        volume: Math.max(0, Math.min(1, volume)),
      },
    })),
  setIsLooping: (isLooping) =>
    set((state) => ({
      playback: { ...state.playback, isLooping },
    })),

  addClip: (clip) => {
    get().pushHistory();
    set((state) => ({
      clips: [...state.clips, clip],
    }));
    persistEditorTimeline(get());
  },
  updateClip: (id, updates, options) => {
    let updatedClip: Clip | undefined;
    if (!options?.skipHistory) {
      get().pushHistory();
    }
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id !== id) {
          return clip;
        }
        updatedClip = {
          ...clip,
          ...updates,
          transforms: updates.transforms
            ? { ...clip.transforms, ...updates.transforms }
            : clip.transforms,
        };
        return updatedClip;
      }),
    }));
    if (updatedClip) {
      persistEditorTimeline(get());
    }
  },
  removeClip: (id) => {
    get().pushHistory();
    set((state) => ({
      clips: state.clips.filter((clip) => clip.id !== id),
      selectedClipIds: state.selectedClipIds.filter((clipId) => clipId !== id),
      clipConnections: state.clipConnections.filter(
        (connection) => connection.sourceId !== id && connection.targetId !== id
      ),
      keyframes: state.keyframes.filter((keyframe) => keyframe.targetId !== id),
      selectedKeyframeIds: state.selectedKeyframeIds.filter((keyframeId) => keyframeId !== id),
    }));
    persistEditorTimeline(get());
  },
  removeClipLocal: (id) =>
    set((state) => ({
      clips: state.clips.filter((clip) => clip.id !== id),
      selectedClipIds: state.selectedClipIds.filter((clipId) => clipId !== id),
    })),
  syncClipFromRemote: (clip) =>
    set((state) => {
      const exists = state.clips.some((item) => item.id === clip.id);
      return {
        clips: exists
          ? state.clips.map((item) => (item.id === clip.id ? clip : item))
          : [...state.clips, clip],
      };
    }),

  addAudioTrack: (track) => {
    get().pushHistory();
    set((state) => ({
      audioTracks: [...state.audioTracks, track],
    }));
    persistEditorTimeline(get());
  },
  updateAudioTrack: (id, updates, options) => {
    let updatedTrack: AudioTrack | undefined;
    if (!options?.skipHistory) {
      get().pushHistory();
    }
    set((state) => ({
      audioTracks: state.audioTracks.map((track) => {
        if (track.id !== id) {
          return track;
        }
        updatedTrack = { ...track, ...updates };
        return updatedTrack;
      }),
    }));
    if (updatedTrack) {
      persistEditorTimeline(get());
    }
  },
  removeAudioTrack: (id) => {
    get().pushHistory();
    set((state) => ({
      audioTracks: state.audioTracks.filter((track) => track.id !== id),
      selectedAudioTrackIds: state.selectedAudioTrackIds.filter((trackId) => trackId !== id),
    }));
    persistEditorTimeline(get());
  },
  removeAudioTrackLocal: (id) =>
    set((state) => ({
      audioTracks: state.audioTracks.filter((track) => track.id !== id),
      selectedAudioTrackIds: state.selectedAudioTrackIds.filter((trackId) => trackId !== id),
    })),
  syncAudioTrackFromRemote: (track) =>
    set((state) => {
      const exists = state.audioTracks.some((item) => item.id === track.id);
      return {
        audioTracks: exists
          ? state.audioTracks.map((item) => (item.id === track.id ? track : item))
          : [...state.audioTracks, track],
      };
    }),

  splitClipAtTime: (id, timeMs) => {
    const state = get();
    const result = splitTimelineClipAtTime(
      {
        clips: state.clips,
        audioTracks: state.audioTracks,
        keyframes: state.keyframes,
      },
      id,
      timeMs,
      createId
    );
    if (!result) {
      return false;
    }

    state.pushHistory();
    set({
      clips: result.clips,
      audioTracks: result.audioTracks,
      keyframes: result.keyframes,
      selectedClipIds: result.selectedClipIds,
      selectedKeyframeIds: [],
    });
    persistEditorTimeline(get());
    return true;
  },

  moveTimelineItems: (selection, deltaMs) => {
    if (!deltaMs) {
      return 0;
    }
    const state = get();
    const result = moveTimelineSelection(
      {
        clips: state.clips,
        audioTracks: state.audioTracks,
        keyframes: state.keyframes,
      },
      selection,
      deltaMs
    );
    const movedCount = result.movedClipIds.length + result.movedAudioTrackIds.length;
    if (movedCount === 0 || result.appliedDeltaMs === 0) {
      return 0;
    }

    state.pushHistory();
    set({
      clips: result.clips,
      audioTracks: result.audioTracks,
      keyframes: result.keyframes,
    });
    persistEditorTimeline(get());
    return movedCount;
  },

  deleteTimelineItems: (selection, options) => {
    const state = get();
    const result = deleteTimelineSelection(
      {
        clips: state.clips,
        audioTracks: state.audioTracks,
        keyframes: state.keyframes,
      },
      selection,
      options
    );
    const deletedCount = result.deletedClipIds.length + result.deletedAudioTrackIds.length;
    if (deletedCount === 0) {
      return 0;
    }

    const deletedClipIds = new Set(result.deletedClipIds);
    const deletedAudioTrackIds = new Set(result.deletedAudioTrackIds);
    state.pushHistory();
    set((current) => ({
      clips: result.clips,
      audioTracks: result.audioTracks,
      keyframes: result.keyframes,
      selectedClipIds: current.selectedClipIds.filter((clipId) => !deletedClipIds.has(clipId)),
      selectedAudioTrackIds: current.selectedAudioTrackIds.filter((trackId) => !deletedAudioTrackIds.has(trackId)),
      selectedKeyframeIds: current.selectedKeyframeIds.filter((keyframeId) =>
        result.keyframes.some((keyframe) => keyframe.id === keyframeId)
      ),
      clipConnections: current.clipConnections.filter(
        (connection) => !deletedClipIds.has(connection.sourceId) && !deletedClipIds.has(connection.targetId)
      ),
    }));
    persistEditorTimeline(get());
    return deletedCount;
  },

  duplicateTimelineItems: (selection, offsetMs) => {
    const state = get();
    const result = duplicateTimelineSelection(
      {
        clips: state.clips,
        audioTracks: state.audioTracks,
        keyframes: state.keyframes,
      },
      selection,
      offsetMs ?? (state.timeline.gridSize || 100),
      createId
    );
    const duplicatedCount = result.duplicatedClipIds.length + result.duplicatedAudioTrackIds.length;
    if (duplicatedCount === 0) {
      return 0;
    }

    state.pushHistory();
    set({
      clips: result.clips,
      audioTracks: result.audioTracks,
      keyframes: result.keyframes,
      selectedClipIds: result.duplicatedClipIds,
      selectedAudioTrackIds: result.duplicatedAudioTrackIds,
    });
    persistEditorTimeline(get());
    return duplicatedCount;
  },

  deleteSelectedItems: (options) => {
    const state = get();
    return state.deleteTimelineItems(
      {
        clipIds: state.selectedClipIds,
        audioTrackIds: state.selectedAudioTrackIds,
      },
      options
    );
  },

  duplicateSelectedItems: (offsetMs) => {
    const state = get();
    return state.duplicateTimelineItems(
      {
        clipIds: state.selectedClipIds,
        audioTrackIds: state.selectedAudioTrackIds,
      },
      offsetMs
    );
  },

  selectClip: (id, addToSelection = false) =>
    set((state) => ({
      selectedClipIds: addToSelection ? [...state.selectedClipIds, id] : [id],
      selectedAudioTrackIds: addToSelection ? state.selectedAudioTrackIds : [],
    })),
  deselectClip: (id) =>
    set((state) => ({
      selectedClipIds: state.selectedClipIds.filter((clipId) => clipId !== id),
    })),
  clearClipSelection: () => set({ selectedClipIds: [] }),

  selectAudioTrack: (id, addToSelection = false) =>
    set((state) => ({
      selectedAudioTrackIds: addToSelection ? [...state.selectedAudioTrackIds, id] : [id],
      selectedClipIds: addToSelection ? state.selectedClipIds : [],
    })),
  deselectAudioTrack: (id) =>
    set((state) => ({
      selectedAudioTrackIds: state.selectedAudioTrackIds.filter((trackId) => trackId !== id),
    })),
  clearAudioTrackSelection: () => set({ selectedAudioTrackIds: [] }),

  addClipConnection: (connection) =>
    set((state) => ({
      clipConnections: [...state.clipConnections, connection],
    })),
  removeClipConnection: (id) =>
    set((state) => ({
      clipConnections: state.clipConnections.filter((conn) => conn.id !== id),
    })),
  setActiveConnection: (connection) => set({ activeConnection: connection }),
  updateActiveConnectionCursor: (x, y) =>
    set((state) =>
      state.activeConnection
        ? { activeConnection: { ...state.activeConnection, cursorX: x, cursorY: y } }
        : state
    ),

  addKeyframe: (keyframe) => {
    get().pushHistory();
    set((state) => ({
      keyframes: [...state.keyframes, keyframe],
    }));
    persistEditorTimeline(get());
  },
  updateKeyframe: (id, updates) => {
    get().pushHistory();
    set((state) => ({
      keyframes: state.keyframes.map((keyframe) =>
        keyframe.id === id ? { ...keyframe, ...updates } : keyframe
      ),
    }));
    persistEditorTimeline(get());
  },
  removeKeyframe: (id) => {
    get().pushHistory();
    set((state) => ({
      keyframes: state.keyframes.filter((keyframe) => keyframe.id !== id),
      selectedKeyframeIds: state.selectedKeyframeIds.filter((keyframeId) => keyframeId !== id),
    }));
    persistEditorTimeline(get());
  },
  selectKeyframe: (id, addToSelection = false) =>
    set((state) => ({
      selectedKeyframeIds: addToSelection ? [...state.selectedKeyframeIds, id] : [id],
    })),
  deselectKeyframe: (id) =>
    set((state) => ({
      selectedKeyframeIds: state.selectedKeyframeIds.filter((keyframeId) => keyframeId !== id),
    })),
  clearKeyframeSelection: () => set({ selectedKeyframeIds: [] }),

  openDialog: (dialog) =>
    set((state) => ({
      dialogs: { ...state.dialogs, [dialog]: true },
    })),
  closeDialog: (dialog) =>
    set((state) => ({
      dialogs: { ...state.dialogs, [dialog]: false },
    })),
  toggleDialog: (dialog) =>
    set((state) => ({
      dialogs: { ...state.dialogs, [dialog]: !state.dialogs[dialog] },
    })),

  setGenerationParams: (params) =>
    set((state) => ({
      generationParams: { ...state.generationParams, ...params },
    })),
  startGeneration: (message) =>
    set((state) => ({
      aiGeneration: {
        status: 'running',
        progress: 0,
        message,
        lastGeneratedId: undefined,
      },
    })),
  updateGenerationProgress: (progress, message) =>
    set((state) => ({
      aiGeneration: {
        ...state.aiGeneration,
        status: 'running',
        progress: Math.max(0, Math.min(1, progress)),
        message: message ?? state.aiGeneration.message,
      },
    })),
  finishGeneration: (status = 'completed', message, lastGeneratedId) =>
    set((state) => ({
      aiGeneration: {
        status,
        progress: status === 'completed' ? 1 : state.aiGeneration.progress,
        message,
        lastGeneratedId,
      },
    })),

  setTimelineZoom: (zoom) =>
    set((state) => ({
      timeline: { ...state.timeline, zoom: Math.max(10, Math.min(zoom, 400)) },
    })),
  zoomTimelineIn: (step = 5) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        zoom: Math.max(10, Math.min(state.timeline.zoom + step, 400)),
      },
    })),
  zoomTimelineOut: (step = 5) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        zoom: Math.max(10, Math.min(state.timeline.zoom - step, 400)),
      },
    })),
  setTimelineScroll: (scroll) =>
    set((state) => ({
      timeline: { ...state.timeline, scrollOffset: Math.max(0, scroll) },
    })),
  scrollTimelineBy: (delta) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        scrollOffset: Math.max(0, state.timeline.scrollOffset + delta),
      },
    })),
  setSnapToGrid: (enabled) =>
    set((state) => ({
      timeline: { ...state.timeline, snapToGrid: enabled },
    })),
  nudgeSelectedClips: (deltaMs) => {
    if (!deltaMs) return;
    const state = get();
    if (state.selectedClipIds.length === 0 && state.selectedAudioTrackIds.length === 0) {
      return;
    }
    state.moveTimelineItems(
      {
        clipIds: state.selectedClipIds,
        audioTrackIds: state.selectedAudioTrackIds,
      },
      deltaMs
    );
  },

  setCompositionSettings: (settings) => {
    get().pushHistory();
    set((state) => ({
      composition: { ...state.composition, ...settings },
    }));
    persistEditorTimeline(get());
  },

  loadProject: async (projectId) => {
    try {
      const { clips, audioTracks, composition, keyframes } = await videoEditorService.getEditorTimeline(projectId);

      set((state) => ({
        project: { ...state.project, id: projectId },
        clips,
        audioTracks,
        composition,
        keyframes,
        selectedClipIds: [],
        selectedAudioTrackIds: [],
        selectedKeyframeIds: [],
        history: { ...state.history, past: [], future: [] },
        clipboard: [],
      }));
    } catch (error) {
      console.error('Failed to load project state', error);
    }
  },

  loadMediaLibrary: async (projectId) => {
    if (isDevAuthBypassEnabled()) {
      set((state) => ({
        mediaLibrary: { ...state.mediaLibrary, items: [], isLoading: false },
      }));
      return;
    }

    set((state) => ({
      mediaLibrary: { ...state.mediaLibrary, isLoading: true },
    }));
    try {
      const items = await videoEditorService.getMediaItems(projectId);
      set((state) => ({
        mediaLibrary: { ...state.mediaLibrary, items, isLoading: false },
      }));
    } catch (error) {
      console.error('Failed to load media library', error);
      set((state) => ({
        mediaLibrary: { ...state.mediaLibrary, isLoading: false },
      }));
    }
  },

  setMediaLibraryItems: (items) =>
    set((state) => ({
      mediaLibrary: { ...state.mediaLibrary, items },
    })),
  addMediaLibraryItem: (item) =>
    set((state) => ({
      mediaLibrary: { ...state.mediaLibrary, items: [item, ...state.mediaLibrary.items] },
    })),
  addMediaItem: (item) =>
    set((state) => ({
      mediaLibrary: { ...state.mediaLibrary, items: [item, ...state.mediaLibrary.items] },
    })),
  updateMediaLibraryItem: (id, updates) =>
    set((state) => ({
      mediaLibrary: {
        ...state.mediaLibrary,
        items: state.mediaLibrary.items.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        ),
      },
    })),
  clearMediaLibrary: () =>
    set((state) => ({
      mediaLibrary: { ...state.mediaLibrary, items: [] },
    })),
  setMediaLibraryLoading: (isLoading) =>
    set((state) => ({
      mediaLibrary: { ...state.mediaLibrary, isLoading },
    })),

  pushHistory: () => {
    const snapshot = createHistoryEntry(get());
    set((state) => ({
      history: {
        ...state.history,
        past: [...state.history.past, snapshot].slice(-state.history.maxSize),
        future: [],
      },
    }));
  },
  undo: () => {
    const state = get();
    if (state.history.past.length === 0) {
      return;
    }
    const previous = state.history.past[state.history.past.length - 1];
    set((current) => ({
      clips: previous.clips,
      audioTracks: previous.audioTracks,
      keyframes: previous.keyframes,
      playback: previous.playback,
      timeline: previous.timeline,
      composition: previous.composition,
      history: {
        ...current.history,
        past: current.history.past.slice(0, -1),
        future: [createHistoryEntry(current), ...current.history.future].slice(
          0,
          current.history.maxSize
        ),
      },
    }));
    persistEditorTimeline(get());
  },
  redo: () => {
    const state = get();
    if (state.history.future.length === 0) {
      return;
    }
    const next = state.history.future[0];
    set((current) => ({
      clips: next.clips,
      audioTracks: next.audioTracks,
      keyframes: next.keyframes,
      playback: next.playback,
      timeline: next.timeline,
      composition: next.composition,
      history: {
        ...current.history,
        past: [...current.history.past, createHistoryEntry(current)].slice(
          -current.history.maxSize
        ),
        future: current.history.future.slice(1),
      },
    }));
    persistEditorTimeline(get());
  },
  copySelectedClips: () => {
    const state = get();
    const selected = state.clips.filter((clip) => state.selectedClipIds.includes(clip.id));
    set({ clipboard: cloneSlice(selected) });
  },
  pasteClipboard: () => {
    const state = get();
    if (!state.clipboard.length) {
      return;
    }
    state.pushHistory();
    const offset = state.timeline.gridSize || 100;
    const duplicates = state.clipboard.map((clip, index) => {
      const startTime = (clip.startTime ?? 0) + offset * (index + 1);
      const duration = clip.duration ?? 0;
      return {
        ...cloneSlice(clip),
        id: createId(),
        startTime,
        endTime: startTime + duration,
      };
    });
    set((current) => ({
      clips: [...current.clips, ...duplicates],
      selectedClipIds: duplicates.map((clip) => clip.id),
    }));
    persistEditorTimeline(get());
  },

  reset: () => set(() => ({ ...initialState })),
}));
