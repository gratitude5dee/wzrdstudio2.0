import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  BuilderStep,
  CharacterBlueprint,
  CharacterBodyDetails,
  CharacterCreationMode,
  CharacterCreationState,
  CharacterFaceDetails,
  CharacterKind,
  CharacterMention,
  CharacterStyleDetails,
  CharacterTraits,
} from '@/types/character-creation';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DRAFT_TRAITS: CharacterTraits = {};
const DEFAULT_DRAFT_FACE: CharacterFaceDetails = {};
const DEFAULT_DRAFT_BODY: CharacterBodyDetails = {};
const DEFAULT_DRAFT_STYLE: CharacterStyleDetails = {};

const initialState: CharacterCreationState = {
  mode: 'gallery',
  blueprints: [],
  currentStep: 'character-type',
  draftName: '',
  draftKind: 'character',
  draftTraits: { ...DEFAULT_DRAFT_TRAITS },
  draftFaceDetails: { ...DEFAULT_DRAFT_FACE },
  draftBodyDetails: { ...DEFAULT_DRAFT_BODY },
  draftStyleDetails: { ...DEFAULT_DRAFT_STYLE },
  selectedBlueprintId: null,
  loading: false,
  generating: false,
};

// ---------------------------------------------------------------------------
// Prompt fragment builder
// ---------------------------------------------------------------------------

export function buildPromptFragment(
  traits: CharacterTraits,
  face: CharacterFaceDetails,
  body: CharacterBodyDetails,
  style: CharacterStyleDetails,
): string {
  const parts: string[] = [];

  if (style.artStyle) parts.push(`${style.artStyle} style`);
  if (traits.age) parts.push(traits.age.toLowerCase());
  if (traits.gender) parts.push(traits.gender.toLowerCase());
  if (traits.ethnicity) parts.push(`${traits.ethnicity} descent`);
  if (traits.characterType && traits.characterType !== 'Human') {
    parts.push(`${traits.characterType.toLowerCase()} humanoid`);
  }
  if (traits.skinColor) parts.push(`${traits.skinColor.toLowerCase()} skin`);
  if (traits.skinCondition) parts.push(`with ${traits.skinCondition.toLowerCase()}`);
  if (face.eyeType && face.eyeType !== 'Human') parts.push(`${face.eyeType.toLowerCase()} eyes`);
  if (face.eyeDetail) parts.push(face.eyeDetail.toLowerCase());
  if (face.mouthTeeth && face.mouthTeeth !== 'Normal') parts.push(face.mouthTeeth.toLowerCase());
  if (body.build) parts.push(`${body.build.toLowerCase()} build`);
  if (style.clothing) parts.push(`wearing ${style.clothing}`);
  if (style.accessories) parts.push(`with ${style.accessories}`);
  if (style.customPrompt) parts.push(style.customPrompt);

  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface CharacterCreationActions {
  // Mode
  setMode: (mode: CharacterCreationMode) => void;

  // Blueprint CRUD
  setBlueprints: (blueprints: CharacterBlueprint[]) => void;
  addBlueprint: (blueprint: CharacterBlueprint) => void;
  updateBlueprint: (id: string, updates: Partial<CharacterBlueprint>) => void;
  removeBlueprint: (id: string) => void;
  toggleFavorite: (id: string) => void;
  incrementUsage: (id: string) => void;

  // Builder wizard
  setCurrentStep: (step: BuilderStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setDraftName: (name: string) => void;
  setDraftKind: (kind: CharacterKind) => void;
  updateDraftTraits: (updates: Partial<CharacterTraits>) => void;
  updateDraftFaceDetails: (updates: Partial<CharacterFaceDetails>) => void;
  updateDraftBodyDetails: (updates: Partial<CharacterBodyDetails>) => void;
  updateDraftStyleDetails: (updates: Partial<CharacterStyleDetails>) => void;

  // Draft prompt preview
  getDraftPromptFragment: () => string;

  // Detail view
  selectBlueprint: (id: string | null) => void;

  // Loading flags
  setLoading: (loading: boolean) => void;
  setGenerating: (generating: boolean) => void;

  // @mention helpers
  getMentionList: () => CharacterMention[];
  findBySlug: (slug: string) => CharacterBlueprint | undefined;

  // Reset
  resetDraft: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Step ordering
// ---------------------------------------------------------------------------

const STEP_ORDER: BuilderStep[] = [
  'character-type',
  'gender',
  'ethnicity',
  'skin-color',
  'skin-condition',
  'age',
  'face',
  'body',
  'style',
  'review',
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCharacterCreationStore = create<CharacterCreationState & CharacterCreationActions>()(
  devtools((set, get) => ({
    ...initialState,

    // -- Mode ---------------------------------------------------------------

    setMode: (mode) => set({ mode }, false, 'setMode'),

    // -- Blueprints ---------------------------------------------------------

    setBlueprints: (blueprints) => set({ blueprints }, false, 'setBlueprints'),

    addBlueprint: (blueprint) =>
      set(
        (state) => ({ blueprints: [blueprint, ...state.blueprints] }),
        false,
        'addBlueprint',
      ),

    updateBlueprint: (id, updates) =>
      set(
        (state) => ({
          blueprints: state.blueprints.map((b) =>
            b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b,
          ),
        }),
        false,
        'updateBlueprint',
      ),

    removeBlueprint: (id) =>
      set(
        (state) => ({
          blueprints: state.blueprints.filter((b) => b.id !== id),
          selectedBlueprintId:
            state.selectedBlueprintId === id ? null : state.selectedBlueprintId,
        }),
        false,
        'removeBlueprint',
      ),

    toggleFavorite: (id) =>
      set(
        (state) => ({
          blueprints: state.blueprints.map((b) =>
            b.id === id ? { ...b, isFavorite: !b.isFavorite } : b,
          ),
        }),
        false,
        'toggleFavorite',
      ),

    incrementUsage: (id) =>
      set(
        (state) => ({
          blueprints: state.blueprints.map((b) =>
            b.id === id ? { ...b, usageCount: b.usageCount + 1 } : b,
          ),
        }),
        false,
        'incrementUsage',
      ),

    // -- Builder Wizard -----------------------------------------------------

    setCurrentStep: (step) => set({ currentStep: step }, false, 'setCurrentStep'),

    nextStep: () =>
      set((state) => {
        const idx = STEP_ORDER.indexOf(state.currentStep);
        if (idx < STEP_ORDER.length - 1) {
          return { currentStep: STEP_ORDER[idx + 1] };
        }
        return {};
      }, false, 'nextStep'),

    prevStep: () =>
      set((state) => {
        const idx = STEP_ORDER.indexOf(state.currentStep);
        if (idx > 0) {
          return { currentStep: STEP_ORDER[idx - 1] };
        }
        return {};
      }, false, 'prevStep'),

    setDraftName: (name) => set({ draftName: name }, false, 'setDraftName'),

    setDraftKind: (kind) => set({ draftKind: kind }, false, 'setDraftKind'),

    updateDraftTraits: (updates) =>
      set(
        (state) => ({ draftTraits: { ...state.draftTraits, ...updates } }),
        false,
        'updateDraftTraits',
      ),

    updateDraftFaceDetails: (updates) =>
      set(
        (state) => ({ draftFaceDetails: { ...state.draftFaceDetails, ...updates } }),
        false,
        'updateDraftFaceDetails',
      ),

    updateDraftBodyDetails: (updates) =>
      set(
        (state) => ({ draftBodyDetails: { ...state.draftBodyDetails, ...updates } }),
        false,
        'updateDraftBodyDetails',
      ),

    updateDraftStyleDetails: (updates) =>
      set(
        (state) => ({ draftStyleDetails: { ...state.draftStyleDetails, ...updates } }),
        false,
        'updateDraftStyleDetails',
      ),

    getDraftPromptFragment: () => {
      const s = get();
      return buildPromptFragment(s.draftTraits, s.draftFaceDetails, s.draftBodyDetails, s.draftStyleDetails);
    },

    // -- Detail View --------------------------------------------------------

    selectBlueprint: (id) =>
      set({ selectedBlueprintId: id, mode: id ? 'detail' : 'gallery' }, false, 'selectBlueprint'),

    // -- Flags --------------------------------------------------------------

    setLoading: (loading) => set({ loading }, false, 'setLoading'),
    setGenerating: (generating) => set({ generating }, false, 'setGenerating'),

    // -- @Mention helpers ---------------------------------------------------

    getMentionList: () => {
      return get().blueprints.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        imageUrl: b.imageUrl,
        promptFragment: b.promptFragment,
        kind: b.kind,
      }));
    },

    findBySlug: (slug) => {
      const normalised = slug.toLowerCase().replace(/^@/, '');
      return get().blueprints.find((b) => b.slug === normalised);
    },

    // -- Reset --------------------------------------------------------------

    resetDraft: () =>
      set(
        {
          currentStep: 'character-type',
          draftName: '',
          draftKind: 'character',
          draftTraits: { ...DEFAULT_DRAFT_TRAITS },
          draftFaceDetails: { ...DEFAULT_DRAFT_FACE },
          draftBodyDetails: { ...DEFAULT_DRAFT_BODY },
          draftStyleDetails: { ...DEFAULT_DRAFT_STYLE },
        },
        false,
        'resetDraft',
      ),

    reset: () => set({ ...initialState }, false, 'reset'),
  })),
);
