
/**
 * Prompt templates for AI services
 */

// Visual prompt generation for shots
export function getVisualPromptSystemPrompt(): string {
  return `You are an expert cinematic director and visual artist. Your task is to create detailed, specific visual prompts for AI image generation.
Focus on translating abstract shot descriptions into concrete visual descriptions that will produce high-quality, cinematic images.

Follow these guidelines:
1. Be extremely detailed about visual elements, composition, lighting, camera angle, and mood.
2. Avoid any non-visual elements like sounds, smells, or tactile sensations that image generators cannot render.
3. Avoid mentioning specific people, celebrities, or copyrighted characters.
4. Use visual descriptors that align with high-quality cinematic imagery.
5. Focus on what should be VISIBLE in the frame, not actions or sequences.
6. Do NOT include camera movement instructions like "panning" or "zooming" as these are for video, not still images.
7. Each prompt should be self-contained and not reference other shots.

Your output MUST be a single paragraph (no bullet points or line breaks) of 50-100 words, focusing solely on the visual aspects of the scene.`;
}

export function getVisualPromptUserPrompt(
  shotIdea: string,
  shotType: string | null,
  sceneDetails: {
    description?: string | null;
    location?: string | null;
    lighting?: string | null;
    weather?: string | null;
    title?: string | null;
  },
  projectDetails: {
    genre?: string | null;
    tone?: string | null;
    video_style?: string | null;
    aspect_ratio?: string | null;
    cinematic_inspiration?: string | null;
  }
): string {
  const input = {
    shot: {
      idea: shotIdea,
      type: shotType || 'medium',
    },
    scene: {
      title: sceneDetails.title || null,
      description: sceneDetails.description || null,
      location: sceneDetails.location || null,
      lighting: sceneDetails.lighting || null,
      weather: sceneDetails.weather || null,
    },
    project: {
      genre: projectDetails.genre || null,
      tone: projectDetails.tone || null,
      visualStyle: projectDetails.video_style || null,
      aspectRatio: projectDetails.aspect_ratio || null,
      cinematicInspiration: projectDetails.cinematic_inspiration || null,
    },
    requirements: {
      outputFormat: 'single paragraph, 50-100 words',
      focus: ['composition', 'lighting', 'colors', 'mood', 'camera angle'],
      avoid: ['sounds', 'smells', 'camera movements like panning/zooming', 'references to other shots'],
    },
  };

  return `INPUT (structured JSON):
${JSON.stringify(input, null, 2)}

Based on the structured input above, generate a detailed visual prompt that describes exactly what should be seen in this shot. Focus on composition, lighting, colors, and mood. Make it specific enough to guide an AI image generator to create a high-quality, cinematic image.`;
}

// Character visual prompt generation
export function getCharacterVisualSystemPrompt(): string {
  return `You are an expert character designer and visual artist. Your task is to create detailed, specific visual prompts for AI image generation of characters.

Follow these guidelines:
1. Be extremely detailed about the character's appearance, including facial features, body type, clothing, and distinguishing characteristics.
2. Focus on creating cinematic, visually striking character designs that would work well in film or high-end media.
3. Avoid mentioning specific celebrities, real people, or copyrighted characters.
4. Describe the character in a way that captures their personality through visual elements.
5. Include details about pose, expression, and the environment/background that best showcases the character.

Your output MUST be a single paragraph (no bullet points or line breaks) of 50-100 words, focusing solely on the visual aspects of the character.`;
}

export function getCharacterVisualUserPrompt(
  characterName: string,
  characterDescription: string | null,
  projectContext: {
    genre?: string | null;
    tone?: string | null;
    video_style?: string | null;
    cinematic_inspiration?: string | null;
  } = {}
): string {
  const input = {
    character: {
      name: characterName,
      description: characterDescription || 'No detailed description provided.',
    },
    project: {
      genre: projectContext.genre || null,
      tone: projectContext.tone || null,
      visualStyle: projectContext.video_style || null,
      cinematicInspiration: projectContext.cinematic_inspiration || null,
    },
    requirements: {
      outputFormat: 'single paragraph, 50-100 words',
      focus: ['physical appearance', 'clothing', 'expression', 'pose', 'environmental elements'],
      purpose: 'AI image generation of a high-quality character portrait',
    },
  };

  return `INPUT (structured JSON):
${JSON.stringify(input, null, 2)}

Based on the structured input above, generate a detailed visual prompt that describes exactly how this character should look in a high-quality portrait image. Focus on their physical appearance, clothing, expression, pose, and any environmental elements that would complement the character.`;
}

// Shot idea generation prompts
export function getShotIdeasSystemPrompt(): string {
  return `You are an expert cinematographer and director. Your task is to generate a list of specific shot ideas for a given scene.

Guidelines:
1. Generate 3-5 distinct shot ideas that tell the story effectively
2. Each shot should capture a different moment or aspect of the scene
3. Focus on key dramatic moments, character emotions, and visual storytelling
4. Consider different angles and compositions
5. Each shot idea should be concise but descriptive (10-20 words)
6. Return ONLY a JSON array of strings, nothing else

Example output: ["Wide shot of the bustling marketplace at dawn", "Close-up of the protagonist's determined expression", "Medium shot of the antagonist emerging from shadows"]`;
}

export function getShotIdeasUserPrompt(scene: any): string {
  const input = {
    scene: {
      sceneNumber: scene.scene_number,
      title: scene.title || 'Untitled Scene',
      description: scene.description || 'No description provided',
      location: scene.location || 'Not specified',
      lighting: scene.lighting || 'Not specified',
      weather: scene.weather || 'Not specified',
    },
    requirements: {
      shotCount: { min: 3, max: 5 },
      shotTypes: ['wide', 'medium', 'close_up', 'extreme_close_up', 'pov', 'over_shoulder'],
      outputFormat: 'JSON array of strings, each 10-20 words describing a specific shot',
    },
  };

  return `INPUT (structured JSON):
${JSON.stringify(input, null, 2)}

Based on the structured input above, create 3-5 specific shot ideas that capture the key moments and emotions of this scene. Return as a JSON array of strings.`;
}

// Shot type determination prompts
export function getShotTypeSystemPrompt(): string {
  return `You are a cinematography expert. Your task is to determine the most appropriate shot type for a given shot idea.

Shot types to choose from:
- wide (establishing shots, full environment)
- medium (waist-up, good for dialogue and interaction)
- close (head and shoulders, for emotion and detail)
- extreme-close (eyes, hands, specific details)

Guidelines:
1. Consider what the shot is trying to convey
2. Wide shots for location/context
3. Medium shots for character interaction
4. Close shots for emotion and character focus
5. Extreme close shots for intimate details or tension

Return ONLY the shot type (wide, medium, close, or extreme-close), nothing else.`;
}

export function getShotTypeUserPrompt(shotIdea: string): string {
  const input = {
    shotIdea,
    allowedTypes: ['wide', 'medium', 'close', 'extreme-close'],
    outputFormat: 'Return only the shot type string, nothing else',
  };

  return `INPUT (structured JSON):
${JSON.stringify(input, null, 2)}

Determine the best shot type for this shot idea. Return only the shot type: wide, medium, close, or extreme-close`;
}

// Dialogue generation prompts
export function getDialogueSystemPrompt(): string {
  return `You are an expert screenwriter specializing in natural, cinematic dialogue. Generate dialogue that:
- Fits the scene context and shot composition
- Matches the project's tone and genre
- Sounds natural and character-appropriate
- Is concise and impactful (avoid exposition dumps)
- Advances the story or reveals character

Return ONLY the dialogue text without quotation marks or attribution (e.g., "Character:"). If no dialogue is needed for this shot, return "No dialogue" or describe voiceover if appropriate.`;
}

export function getDialogueUserPrompt(
  shotIdea: string,
  shotType: string,
  sceneContext: any,
  projectContext: any
): string {
  const input = {
    shot: {
      idea: shotIdea,
      type: shotType,
    },
    scene: {
      title: sceneContext.title || `Scene ${sceneContext.scene_number}`,
      description: sceneContext.description || 'No description',
      location: sceneContext.location || 'Unspecified',
    },
    project: {
      genre: projectContext.genre || 'Unspecified',
      tone: projectContext.tone || 'Unspecified',
      visualStyle: projectContext.video_style || 'Unspecified',
    },
    requirements: {
      maxLines: 3,
      fallback: 'Return "No dialogue" if it is a silent shot or establishing shot',
    },
  };

  return `INPUT (structured JSON):
${JSON.stringify(input, null, 2)}

Based on the structured input above, generate natural dialogue (2-3 lines max) or indicate "No dialogue" if it's a silent shot or establishing shot.`;
}

// Sound effects generation prompts
export function getSoundEffectsSystemPrompt(): string {
  return `You are an expert sound designer for film and video. Generate sound effects descriptions that:
- Enhance the visual scene
- Match the shot type and action
- Include ambient sounds and specific effects
- Use professional sound design terminology
- Are clear and implementable

Return a concise list of 2-4 key sound effects (e.g., "City traffic ambience, footsteps on concrete, distant sirens"). If no sound effects are needed, return "Natural ambience".`;
}

export function getSoundEffectsUserPrompt(
  shotIdea: string,
  shotType: string,
  sceneContext: any
): string {
  const input = {
    shot: {
      idea: shotIdea,
      type: shotType,
    },
    scene: {
      location: sceneContext.location || 'Unspecified',
      lighting: sceneContext.lighting || 'Unspecified',
      weather: sceneContext.weather || 'Unspecified',
    },
    requirements: {
      effectCount: { min: 2, max: 4 },
      categories: ['ambient', 'foley', 'specific sounds'],
      outputFormat: 'Concise comma-separated list of sound effects',
    },
  };

  return `INPUT (structured JSON):
${JSON.stringify(input, null, 2)}

Based on the structured input above, list 2-4 specific sound effects that would enhance this shot (ambient, foley, specific sounds). Be concise and professional.`;
}

// Add other prompt helpers below as needed
