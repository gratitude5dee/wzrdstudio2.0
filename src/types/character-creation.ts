// ---------------------------------------------------------------------------
// Character Creation — Type definitions for the Character/Object Builder
// ---------------------------------------------------------------------------

// ---- Kind -----------------------------------------------------------------

export type CharacterKind = 'character' | 'object' | 'creature' | 'vehicle' | 'environment' | 'location';

// ---- Builder Trait Options -------------------------------------------------

export type CharacterType =
  | 'Human' | 'Ant' | 'Bee' | 'Octopus' | 'Crocodile' | 'Iguana'
  | 'Lizard' | 'Alien' | 'Beetle' | 'Reptile' | 'Amphibian' | 'Elf';

export type GenderType = 'Female' | 'Male' | 'Trans man' | 'Trans woman' | 'Non-binary';

export type EthnicityType = 'African' | 'Asian' | 'European' | 'Indian' | 'Middle Eastern' | 'Mixed';

export type SkinColorType = 'Light' | 'Medium' | 'Tan' | 'Brown' | 'Dark' | 'Ebony';

export type SkinConditionType =
  | 'Vitiligo' | 'Pigmentation' | 'Freckles'
  | 'Birthmarks' | 'Scars' | 'Burns'
  | 'Albinism' | 'Cracked / dry skin' | 'Wrinkled skin';

export type AgeType = 'Adult' | 'Mature' | 'Senior';

export type EyeType = 'Human' | 'Reptile' | 'Mechanical';

export type EyeDetailType = 'Different eye color' | 'Blind eye' | 'Scarred eye' | 'Glowing eye';

export type MouthTeethType = 'Normal' | 'Fangs' | 'Tusks' | 'Braces' | 'Gold teeth' | 'Missing teeth';

export type BodyBuildType = 'Slim' | 'Athletic' | 'Average' | 'Muscular' | 'Heavy' | 'Petite';

export type ArtStyleType = 'Photorealistic' | 'Anime' | 'Comic' | 'Oil painting' | 'Watercolor' | '3D Render' | 'Pixel art';

// ---- Builder Trait Container -----------------------------------------------

export interface CharacterTraits {
  characterType?: CharacterType;
  gender?: GenderType;
  ethnicity?: EthnicityType;
  skinColor?: SkinColorType;
  skinCondition?: SkinConditionType;
  age?: AgeType;
}

export interface CharacterFaceDetails {
  eyeType?: EyeType;
  eyeDetail?: EyeDetailType;
  mouthTeeth?: MouthTeethType;
}

export interface CharacterBodyDetails {
  build?: BodyBuildType;
  height?: string;
  pose?: string;
}

export interface CharacterStyleDetails {
  artStyle?: ArtStyleType;
  clothing?: string;
  accessories?: string;
  customPrompt?: string;
}

export interface LocationMetadata {
  placeName?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  source?: string | null;
}

export interface BlueprintReferenceAsset {
  assetId?: string;
  url: string;
  type: 'image' | 'video' | 'model';
  role: string;
}

// ---- Builder Step Definitions -----------------------------------------------

export type BuilderStep =
  | 'character-type'
  | 'gender'
  | 'ethnicity'
  | 'skin-color'
  | 'skin-condition'
  | 'age'
  | 'face'
  | 'body'
  | 'style'
  | 'review';

export const BUILDER_STEPS: readonly { id: BuilderStep; label: string; section: string }[] = [
  { id: 'character-type', label: 'Character Type', section: 'traits' },
  { id: 'gender', label: 'Gender', section: 'traits' },
  { id: 'ethnicity', label: 'Ethnicity / Origin', section: 'traits' },
  { id: 'skin-color', label: 'Skin Color', section: 'traits' },
  { id: 'skin-condition', label: 'Skin Conditions', section: 'traits' },
  { id: 'age', label: 'Age', section: 'traits' },
  { id: 'face', label: 'Face Details', section: 'face' },
  { id: 'body', label: 'Body', section: 'body' },
  { id: 'style', label: 'Style', section: 'style' },
  { id: 'review', label: 'Review & Generate', section: 'review' },
] as const;

// ---- Option Card (visual selector) -----------------------------------------

export interface TraitOption<T extends string = string> {
  value: T;
  label: string;
  imageUrl?: string;
  icon?: string;
}

// ---- Blueprint (persisted entity) ------------------------------------------

export interface CharacterBlueprint {
  id: string;
  userId: string;
  projectId: string | null;
  name: string;
  slug: string;
  kind: CharacterKind;
  traits: CharacterTraits;
  faceDetails: CharacterFaceDetails;
  bodyDetails: CharacterBodyDetails;
  styleDetails: CharacterStyleDetails;
  promptFragment: string;
  tags?: string[];
  locationMetadata?: LocationMetadata;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  referenceAssetIds: string[];
  referenceImageUrls: string[];
  referenceAssets?: BlueprintReferenceAsset[];
  gmiElementId?: string | null;
  gmiElementRequestId?: string | null;
  gmiElementStatus?: string | null;
  gmiElementError?: string | null;
  gmiElementUpdatedAt?: string | null;
  isFavorite: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterBlueprintImage {
  id: string;
  blueprintId: string;
  assetId: string | null;
  imageUrl: string;
  label: string | null;
  generationRole?: string | null;
  generationMetadata?: Record<string, unknown>;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

// ---- @Mention Reference (lightweight for prompt injection) ------------------

export interface CharacterMention {
  id: string;
  name: string;
  slug: string;
  projectId?: string | null;
  imageUrl: string | null;
  promptFragment: string;
  kind: CharacterKind;
  tags?: string[];
  roles?: string[];
  isPinned: boolean;
  usageCount: number;
  updatedAt: string;
  referenceAssetIds: string[];
  referenceImageUrls: string[];
  referenceAssets?: BlueprintReferenceAsset[];
  gmiElementId?: string | null;
}

// ---- Store State -----------------------------------------------------------

export type CharacterCreationMode = 'gallery' | 'builder' | 'detail';

export interface CharacterCreationState {
  mode: CharacterCreationMode;
  blueprints: CharacterBlueprint[];

  // Builder wizard
  currentStep: BuilderStep;
  draftName: string;
  draftKind: CharacterKind;
  draftTraits: CharacterTraits;
  draftFaceDetails: CharacterFaceDetails;
  draftBodyDetails: CharacterBodyDetails;
  draftStyleDetails: CharacterStyleDetails;

  // Detail view
  selectedBlueprintId: string | null;

  // Loading flags
  loading: boolean;
  generating: boolean;
}

// ---- Prompt Composition Helper Types ----------------------------------------

export interface ResolvedCharacterRef {
  slug: string;
  name: string;
  imageUrl: string | null;
  promptFragment: string;
  kind?: CharacterKind;
  tags?: string[];
  referenceAssetIds: string[];
  referenceImageUrls: string[];
  referenceAssets?: BlueprintReferenceAsset[];
  gmiElementId?: string | null;
}

// ---- Trait Option Catalogs --------------------------------------------------

export const CHARACTER_TYPE_OPTIONS: TraitOption<CharacterType>[] = [
  { value: 'Human', label: 'Human' },
  { value: 'Ant', label: 'Ant' },
  { value: 'Bee', label: 'Bee' },
  { value: 'Octopus', label: 'Octopus' },
  { value: 'Crocodile', label: 'Crocodile' },
  { value: 'Iguana', label: 'Iguana' },
  { value: 'Lizard', label: 'Lizard' },
  { value: 'Alien', label: 'Alien' },
  { value: 'Beetle', label: 'Beetle' },
  { value: 'Reptile', label: 'Reptile' },
  { value: 'Amphibian', label: 'Amphibian' },
  { value: 'Elf', label: 'Elf' },
];

export const GENDER_OPTIONS: TraitOption<GenderType>[] = [
  { value: 'Female', label: 'Female', icon: '♀' },
  { value: 'Male', label: 'Male', icon: '♂' },
  { value: 'Trans man', label: 'Trans man', icon: '⚧' },
  { value: 'Trans woman', label: 'Trans woman', icon: '⚧' },
  { value: 'Non-binary', label: 'Non-binary', icon: '⚪' },
];

export const ETHNICITY_OPTIONS: TraitOption<EthnicityType>[] = [
  { value: 'African', label: 'African' },
  { value: 'Asian', label: 'Asian' },
  { value: 'European', label: 'European' },
  { value: 'Indian', label: 'Indian' },
  { value: 'Middle Eastern', label: 'Middle Eastern' },
  { value: 'Mixed', label: 'Mixed' },
];

export const SKIN_COLOR_OPTIONS: TraitOption<SkinColorType>[] = [
  { value: 'Light', label: 'Light' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Tan', label: 'Tan' },
  { value: 'Brown', label: 'Brown' },
  { value: 'Dark', label: 'Dark' },
  { value: 'Ebony', label: 'Ebony' },
];

export const SKIN_CONDITION_OPTIONS: TraitOption<SkinConditionType>[] = [
  { value: 'Vitiligo', label: 'Vitiligo' },
  { value: 'Pigmentation', label: 'Pigmentation' },
  { value: 'Freckles', label: 'Freckles' },
  { value: 'Birthmarks', label: 'Birthmarks' },
  { value: 'Scars', label: 'Scars' },
  { value: 'Burns', label: 'Burns' },
  { value: 'Albinism', label: 'Albinism' },
  { value: 'Cracked / dry skin', label: 'Cracked / dry skin' },
  { value: 'Wrinkled skin', label: 'Wrinkled skin' },
];

export const AGE_OPTIONS: TraitOption<AgeType>[] = [
  { value: 'Adult', label: 'Adult' },
  { value: 'Mature', label: 'Mature' },
  { value: 'Senior', label: 'Senior' },
];

export const EYE_TYPE_OPTIONS: TraitOption<EyeType>[] = [
  { value: 'Human', label: 'Human' },
  { value: 'Reptile', label: 'Reptile' },
  { value: 'Mechanical', label: 'Mechanical' },
];

export const EYE_DETAIL_OPTIONS: TraitOption<EyeDetailType>[] = [
  { value: 'Different eye color', label: 'Different eye color' },
  { value: 'Blind eye', label: 'Blind eye' },
  { value: 'Scarred eye', label: 'Scarred eye' },
  { value: 'Glowing eye', label: 'Glowing eye' },
];

export const MOUTH_TEETH_OPTIONS: TraitOption<MouthTeethType>[] = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Fangs', label: 'Fangs' },
  { value: 'Tusks', label: 'Tusks' },
  { value: 'Braces', label: 'Braces' },
  { value: 'Gold teeth', label: 'Gold teeth' },
  { value: 'Missing teeth', label: 'Missing teeth' },
];

export const BODY_BUILD_OPTIONS: TraitOption<BodyBuildType>[] = [
  { value: 'Slim', label: 'Slim' },
  { value: 'Athletic', label: 'Athletic' },
  { value: 'Average', label: 'Average' },
  { value: 'Muscular', label: 'Muscular' },
  { value: 'Heavy', label: 'Heavy' },
  { value: 'Petite', label: 'Petite' },
];

export const ART_STYLE_OPTIONS: TraitOption<ArtStyleType>[] = [
  { value: 'Photorealistic', label: 'Photorealistic' },
  { value: 'Anime', label: 'Anime' },
  { value: 'Comic', label: 'Comic' },
  { value: 'Oil painting', label: 'Oil painting' },
  { value: 'Watercolor', label: 'Watercolor' },
  { value: '3D Render', label: '3D Render' },
  { value: 'Pixel art', label: 'Pixel art' },
];
