export const NANO_BANANA_FAST_EDIT_ALIAS = 'nano_banana_fast_edit';
export const DEFAULT_NANO_BANANA_FAST_EDIT_MODEL = 'fal-ai/nano-banana-2/edit';

export function resolveFrontendModelAlias(aliasOrModel?: string | null): string {
  if (!aliasOrModel || aliasOrModel === NANO_BANANA_FAST_EDIT_ALIAS) {
    return import.meta.env.VITE_NANO_BANANA_FAST_EDIT_MODEL ?? DEFAULT_NANO_BANANA_FAST_EDIT_MODEL;
  }
  return aliasOrModel;
}

export interface StructuredImageEditPrompt {
  target_type: 'character' | 'location' | 'shot';
  target_id: string;
  source_image_url: string | null;
  edit_prompt: string;
  model_alias: typeof NANO_BANANA_FAST_EDIT_ALIAS;
  style_reference_url?: string | null;
  preserve?: string[];
  avoid?: string[];
  aspect_ratio?: string | null;
}
