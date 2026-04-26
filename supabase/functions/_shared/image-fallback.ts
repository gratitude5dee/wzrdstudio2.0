/**
 * Deterministic image generation fallback resolver.
 *
 * Rules (per spec):
 * 1. If a style/character reference image exists -> reference-conditioned model.
 * 2. If no reference but a text prompt exists -> text-to-image with a
 *    prioritized fallback ladder: Nanobanana 2 -> Seedream 5 -> default.
 * 3. Never throw "missing image reference" when a text prompt is present.
 * 4. Always return a structured decision so callers can persist it to
 *    metadata for observability.
 */

export type ImageGenerationMode =
  | 'reference_conditioned'
  | 'text_to_image'
  | 'image_edit';

export type FallbackReason =
  | null
  | 'missing_style_or_character_reference'
  | 'invalid_reference'
  | 'reference_fetch_failed';

export interface ImageFallbackInput {
  styleRefUrl?: string | null;
  characterRefUrl?: string | null;
  textPrompt?: string | null;
  /** The model the caller would prefer to use when a reference is available. */
  refModelId?: string | null;
  /** The model the caller would prefer when no reference is needed. */
  defaultModelId?: string | null;
  /** Optional override of the text-to-image fallback ladder. */
  textToImageLadder?: string[];
}

export interface ImageFallbackPolicyDecision {
  has_style_reference: boolean;
  has_character_reference: boolean;
  requested_mode: ImageGenerationMode;
  resolved_mode: ImageGenerationMode;
  resolved_model: string;
  fallback_used: boolean;
  fallback_reason: FallbackReason;
}

const DEFAULT_T2I_LADDER = [
  'gmi/nanobanana-2',
  'gmi/seedream-5-lite',
  'gmi/gemini-3.1-flash-image-preview',
];

function nonEmpty(s?: string | null): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * Resolve the image generation plan deterministically.
 *
 * Throws ONLY when there is neither a usable reference NOR a text prompt
 * (the unrecoverable case). Otherwise always returns a decision.
 */
export function resolveImageGenerationPlan(
  input: ImageFallbackInput,
): ImageFallbackPolicyDecision {
  const hasStyle = nonEmpty(input.styleRefUrl);
  const hasChar = nonEmpty(input.characterRefUrl);
  const hasRef = hasStyle || hasChar;
  const hasPrompt = nonEmpty(input.textPrompt);
  const requested: ImageGenerationMode = hasRef ? 'reference_conditioned' : 'text_to_image';

  if (hasRef) {
    const model = input.refModelId || input.defaultModelId || DEFAULT_T2I_LADDER[0];
    return {
      has_style_reference: hasStyle,
      has_character_reference: hasChar,
      requested_mode: requested,
      resolved_mode: 'reference_conditioned',
      resolved_model: model,
      fallback_used: false,
      fallback_reason: null,
    };
  }

  if (!hasPrompt) {
    throw new Error('NEED_PROMPT_OR_REFERENCE');
  }

  const ladder = input.textToImageLadder && input.textToImageLadder.length > 0
    ? input.textToImageLadder
    : DEFAULT_T2I_LADDER;

  // Pick the first non-empty entry from the ladder; final fallback is default.
  const candidates = [...ladder, input.defaultModelId ?? '', DEFAULT_T2I_LADDER.at(-1) ?? ''];
  const resolvedModel = candidates.find((m) => nonEmpty(m)) || DEFAULT_T2I_LADDER[0];

  return {
    has_style_reference: false,
    has_character_reference: false,
    requested_mode: requested,
    resolved_mode: 'text_to_image',
    resolved_model: resolvedModel,
    fallback_used: true,
    fallback_reason: 'missing_style_or_character_reference',
  };
}

/**
 * Compose a clean prompt from optional context blocks. Skips null/empty
 * values so the final prompt never contains "undefined" / "null" garbage.
 */
export function composePromptBlocks(blocks: Record<string, string | null | undefined>): string {
  return Object.entries(blocks)
    .filter(([, v]) => nonEmpty(v))
    .map(([k, v]) => `${k}: ${(v as string).trim()}`)
    .join('\n');
}
