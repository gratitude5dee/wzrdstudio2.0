/**
 * Cinematic shot/camera controls shared by Image and Video studio nodes.
 *
 * The raw user prompt is preserved verbatim on `node.params.prompt`. These
 * helpers compile a richer "effective" prompt at execution time by appending a
 * cinematographic suffix derived from `node.params.shot`. Keeping the two
 * separate lets users edit, audit, save, and remix prompts without losing
 * their original creative intent.
 */

export type ShotSize =
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'ecu'
  | 'ots'
  | 'pov';

export interface ShotControl {
  shotSize?: ShotSize;
  cameraBody?: string;
  lensFamily?: string;
  focalLength?: string;
  aperture?: string;
  movement?: string; // video-only, ignored for image
  mood?: string;
}

export const SHOT_SIZE_OPTIONS: Array<{ value: ShotSize; label: string }> = [
  { value: 'wide', label: 'Wide' },
  { value: 'medium', label: 'Medium' },
  { value: 'close-up', label: 'Close-up' },
  { value: 'ecu', label: 'ECU' },
  { value: 'ots', label: 'Over-the-shoulder' },
  { value: 'pov', label: 'POV' },
];

export const CAMERA_BODY_OPTIONS = [
  'Sony Venice',
  'ARRI Alexa',
  'RED Komodo',
  'Phantom Flex',
  'Digital',
  '35mm Film',
  '16mm Film',
] as const;

export const LENS_FAMILY_OPTIONS = [
  'Zeiss Ultra Prime',
  'Cooke S4',
  'Anamorphic',
  'Vintage Glass',
  'Macro',
] as const;

export const FOCAL_LENGTH_OPTIONS = [
  '14mm',
  '24mm',
  '35mm',
  '50mm',
  '85mm',
  '135mm',
] as const;

export const APERTURE_OPTIONS = [
  'f/1.4',
  'f/2',
  'f/2.8',
  'f/4',
  'f/5.6',
  'f/8',
] as const;

export const MOVEMENT_OPTIONS = [
  'Static',
  'Dolly',
  'Crane',
  'Handheld',
  'Steadicam',
  'Drone',
  'Push-in',
  'Pull-out',
  'Whip pan',
] as const;

export const MOOD_OPTIONS = [
  'Cinematic',
  'Noir',
  'Golden hour',
  'Neon',
  'Overcast',
  'High-key',
  'Low-key',
] as const;

const SHOT_SIZE_LABELS: Record<ShotSize, string> = {
  wide: 'wide',
  medium: 'medium',
  'close-up': 'close-up',
  ecu: 'extreme close-up',
  ots: 'over-the-shoulder',
  pov: 'POV',
};

export function isShotControlEmpty(shot?: ShotControl | null): boolean {
  if (!shot) return true;
  return (
    !shot.shotSize &&
    !shot.cameraBody &&
    !shot.lensFamily &&
    !shot.focalLength &&
    !shot.aperture &&
    !shot.movement &&
    !shot.mood
  );
}

/**
 * Build a compact human-readable summary like "24mm · f/2.8 · Sony Venice".
 * Used for hover-menu chips and footer pills.
 */
export function summarizeShot(shot?: ShotControl | null): string {
  if (isShotControlEmpty(shot)) return '';
  const parts = [
    shot?.focalLength,
    shot?.aperture,
    shot?.cameraBody,
    shot?.shotSize ? SHOT_SIZE_LABELS[shot.shotSize] : undefined,
  ].filter((value): value is string => Boolean(value && value.trim()));
  return parts.join(' · ');
}

/**
 * Compile a final cinematic prompt by appending a comma-separated
 * cinematographic suffix to the raw prompt. Pure function — does not mutate.
 *
 * Movement is video-only and is skipped for image media types.
 */
export function compileCinematicPrompt(
  rawPrompt: string,
  shot?: ShotControl | null,
  mediaType: 'image' | 'video' = 'image'
): string {
  const trimmed = (rawPrompt ?? '').trim();
  if (isShotControlEmpty(shot)) return trimmed;

  const fragments: string[] = [];

  if (shot?.cameraBody) fragments.push(`shot on ${shot.cameraBody}`);
  if (shot?.lensFamily) fragments.push(shot.lensFamily);
  if (shot?.focalLength && shot?.aperture) {
    fragments.push(`${shot.focalLength} at ${shot.aperture}`);
  } else if (shot?.focalLength) {
    fragments.push(shot.focalLength);
  } else if (shot?.aperture) {
    fragments.push(shot.aperture);
  }
  if (shot?.shotSize) fragments.push(`${SHOT_SIZE_LABELS[shot.shotSize]} framing`);
  if (mediaType === 'video' && shot?.movement) fragments.push(`${shot.movement.toLowerCase()} camera movement`);
  if (shot?.mood) fragments.push(`${shot.mood.toLowerCase()} mood`);

  if (fragments.length === 0) return trimmed;

  const suffix = fragments.join(', ');
  if (!trimmed) return suffix.charAt(0).toUpperCase() + suffix.slice(1) + '.';

  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${separator}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}.`;
}

/**
 * Normalize the various reference-image input keys producers might send
 * (`reference`, `image`, `image_url`, `image_urls`, `referenceImageUrls`,
 * `reference_image_urls`) into a single deduped, ordered array of URLs.
 */
export function normalizeReferenceInputs(
  inputs: Record<string, unknown> | null | undefined
): string[] {
  if (!inputs) return [];
  const collected: string[] = [];

  const push = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string' && value.trim()) {
      collected.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) push(v);
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.url === 'string') push(obj.url);
    }
  };

  const keys = [
    'reference',
    'references',
    'referenceImage',
    'referenceImages',
    'reference_image',
    'reference_images',
    'referenceImageUrls',
    'reference_image_urls',
    'image',
    'images',
    'image_url',
    'image_urls',
  ];
  for (const key of keys) {
    if (key in inputs) push(inputs[key]);
  }

  // Dedupe preserving order
  return Array.from(new Set(collected));
}

/**
 * Structured camera dict for providers that accept it natively.
 */
export function shotToCameraPayload(shot?: ShotControl | null) {
  if (isShotControlEmpty(shot)) return undefined;
  return {
    body: shot?.cameraBody,
    lens: shot?.lensFamily,
    focal_length: shot?.focalLength,
    aperture: shot?.aperture,
    shot_size: shot?.shotSize,
    movement: shot?.movement,
    mood: shot?.mood,
  };
}
