
/**
 * Enhanced Prompt Templates for Gemini AI with Visual Storytelling Focus
 * Optimized for structured JSON output and AI image generation
 */

export interface CustomMetaPromptOverrides {
  storylineSystem?: string;
  storylineStructure?: string;
  shotPrompting?: string;
  characterExtraction?: string;
  negativeConstraints?: string;
}

export interface MusicAnnotationContext {
  selectedStems?: Array<{ stem: string; url: string }>;
  annotatedLyrics?: string;
  transcriptionModel?: string;
}

const trim = (s?: string | null) => (typeof s === 'string' ? s.trim() : '');

export function getStorylineSystemPrompt(
  isAlternative: boolean,
  overrides?: CustomMetaPromptOverrides,
): string {
  // For format=custom with an explicit system override, replace the default
  // system prompt entirely. Always append negative constraints when present.
  const system = trim(overrides?.storylineSystem);
  const negatives = trim(overrides?.negativeConstraints);
  const structure = trim(overrides?.storylineStructure);

  if (system) {
    return [
      system,
      structure ? `\nSTRUCTURE OVERRIDE:\n${structure}` : '',
      negatives ? `\nNEGATIVE CONSTRAINTS (must avoid):\n${negatives}` : '',
    ].filter(Boolean).join('\n');
  }

  const base = `You are a world-class screenwriter AND professional cinematographer with deep expertise in:
- Narrative structure and compelling character development
- Visual storytelling and mise-en-scène
- AI image generation prompt engineering (Flux, Stable Diffusion, DALL-E, Midjourney)
- Professional cinematography (camera angles, lighting design, color theory, composition)
- Video production workflows and storyboarding

Your mission: Generate ${isAlternative ? 'an alternative' : 'a complete'} storyline ${!isAlternative ? 'with detailed scene breakdown ' : ''}optimized for AI-powered video production.

${!isAlternative ? `
CRITICAL VISUAL REQUIREMENTS:
For EVERY shot in EVERY scene, you MUST provide a highly optimized visual prompt that includes:

1. **Art Style/Medium**: Specify the visual aesthetic (e.g., "cinematic photography", "anime style", "3D render", "watercolor illustration")
2. **Shot Type & Angle**: Camera perspective (e.g., "wide angle low shot", "extreme close-up", "aerial drone view")
3. **Lighting**: Precise lighting conditions (e.g., "golden hour backlight", "dramatic rim lighting", "soft diffused studio light", "harsh noon sun")
4. **Color Palette**: Specific color grading (e.g., "teal and orange color grade", "muted pastel tones", "high contrast noir", "vibrant saturated colors")
5. **Composition**: Technical framing notes (e.g., "rule of thirds", "leading lines", "symmetrical composition", "negative space")
6. **Quality Keywords**: Industry terms for AI image generation (e.g., "8K ultra detailed", "professional photography", "photorealistic", "volumetric lighting", "sharp focus")
7. **Mood/Atmosphere**: Emotional ambiance (e.g., "dramatic", "peaceful", "tense", "dreamlike")

VISUAL PROMPT FORMAT RULES:
- Be specific and technical (60-300 characters)
- Front-load the most important visual elements
- Use proven AI image generation keywords
- Avoid vague terms like "beautiful", "nice", "good"
- Include camera and lens details when relevant (e.g., "85mm portrait lens", "wide angle 24mm")
- Specify depth of field when important (e.g., "shallow depth of field", "f/1.4", "bokeh background")

CINEMATOGRAPHY EXCELLENCE:
- Provide overall visual style notes for the entire project
- Suggest camera movements that enhance storytelling
- Recommend shot durations based on content complexity
- Consider emotional pacing and visual rhythm
- Ensure visual consistency across scenes

SHOT DURATION GUIDELINES:
- Establishing shots: 4-6 seconds
- Action/movement: 2-4 seconds  
- Dialogue close-ups: 3-5 seconds
- Emotional beats: 4-7 seconds
- Transitions: 2-3 seconds
` : ''}

OUTPUT STRUCTURE:
Your response is guaranteed to follow the JSON schema provided. Focus on creative content quality.

CREATIVE EXCELLENCE STANDARDS:
- Storylines must have compelling narrative arcs
- Scenes must build emotional progression
- Visual descriptions must be technically precise
- Shot prompts must be optimized for AI image generation
- Maintain visual coherence across the entire project
- Each shot should contribute to storytelling

${isAlternative ? 'Generate a DIFFERENT creative take on the same concept - explore alternative narrative approaches, tones, or visual styles.' : 'Generate between 5-10 scenes with 3-6 key shots per scene.'}`;

  // Append optional structural override + negatives if provided alongside default base.
  return [
    base,
    structure ? `\nADDITIONAL STRUCTURE GUIDANCE (custom):\n${structure}` : '',
    negatives ? `\nNEGATIVE CONSTRAINTS (must avoid):\n${negatives}` : '',
  ].filter(Boolean).join('\n');
}

export function getStorylineUserPrompt(
  project: any,
  isAlternative: boolean,
  existingStorylines: any[] = [],
  overrides?: CustomMetaPromptOverrides,
  musicAnnotation?: MusicAnnotationContext,
): string {
  const adBrief = project.ad_brief_data || {};
  const musicVideo = project.music_video_data || {};
  const infotainment = project.infotainment_data || {};
  const shortFilm = project.short_film_data || {};

  // Build structured project context as JSON
  const projectContextJson: Record<string, unknown> = {
    title: project.title || 'Untitled Project',
    concept: project.concept_text || 'No concept provided. Create something imaginative based on the other details.',
    genre: project.genre || 'Not specified - choose appropriate genre',
    tone: project.tone || 'Not specified - determine appropriate tone',
    format: project.format || 'Not specified',
  };

  if (project.format === 'custom' && project.custom_format_description) {
    projectContextJson.customFormatDescription = project.custom_format_description;
  }
  if (project.special_requests) {
    projectContextJson.specialRequests = project.special_requests;
  }
  if (project.product_name) {
    projectContextJson.productName = project.product_name;
  }
  if (project.target_audience) {
    projectContextJson.targetAudience = project.target_audience;
  }
  if (project.main_message) {
    projectContextJson.mainMessage = project.main_message;
  }
  if (project.call_to_action) {
    projectContextJson.callToAction = project.call_to_action;
  }

  // Build format-specific brief as structured JSON
  let formatBrief: Record<string, unknown> | null = null;
  let formatGuidanceNotes = '';

  switch (project.format) {
    case 'commercial':
      formatGuidanceNotes = 'Craft a concise, persuasive narrative suitable for advertising. Emphasize product benefits, target audience, and call to action. Keep scenes tight and aligned with the ad duration.';
      formatBrief = {
        type: 'commercial',
        product: adBrief.product || project.product_name || '',
        brandName: adBrief.brandName || '',
        productType: adBrief.productType || '',
        targetAudience: adBrief.targetAudience || project.target_audience || '',
        mainMessage: adBrief.mainMessage || project.main_message || '',
        callToAction: adBrief.callToAction || project.call_to_action || '',
        tone: adBrief.tone || '',
        adDuration: adBrief.adDuration || '',
        platform: adBrief.platform || '',
        brandGuidelines: adBrief.brandGuidelines || '',
        hasProductImage: !!(adBrief.productImageUrl),
      };
      break;
    case 'music_video':
      formatGuidanceNotes = 'Align visuals tightly to the track and performance/narrative balance. Use imagery that mirrors the song\'s energy, genre, and lyrical themes.';
      formatBrief = {
        type: 'music_video',
        artistName: musicVideo.artistName || '',
        trackTitle: musicVideo.trackTitle || '',
        genre: musicVideo.genre || '',
        performanceRatio: musicVideo.performanceRatio ?? 50,
        bpm: musicVideo.bpm || null,
        beatCount: musicVideo.beatTimeline?.length || 0,
        hasAudioFile: !!(musicVideo.audioFileName),
        lyricsExcerpt: musicVideo.lyrics ? musicVideo.lyrics.substring(0, 600) : null,
      };
      break;
    case 'infotainment':
      formatGuidanceNotes = 'Combine educational clarity with engaging storytelling. Structure scenes as segments with a clear learning progression.';
      formatBrief = {
        type: 'infotainment',
        topic: infotainment.topic || '',
        targetAudience: infotainment.targetDemographic || '',
        keyFacts: infotainment.keyFacts || '',
        educationalGoals: infotainment.educationalGoals || [],
        hostStyle: infotainment.hostStyle || 'casual',
        visualStyle: infotainment.visualStyle || '',
      };
      break;
    case 'short_film':
      formatGuidanceNotes = 'Focus on a tight narrative arc with cinematic pacing. Prioritize character-driven storytelling and visual symbolism.';
      formatBrief = {
        type: 'short_film',
        genre: shortFilm.genre || project.genre || '',
        tone: shortFilm.tone || project.tone || '',
        duration: shortFilm.duration || '',
        visualStyle: shortFilm.visualStyle || '',
      };
      break;
  }

  if (formatBrief) {
    projectContextJson.formatBrief = formatBrief;
    projectContextJson.formatGuidance = formatGuidanceNotes;
  }

  // Build scene generation requirements as structured JSON
  const sceneRequirements = {
    sceneCount: { min: 5, max: 10 },
    requiredFieldsPerScene: ['scene_number', 'title', 'description', 'location', 'lighting', 'weather', 'emotional_tone', 'color_palette'],
    shotsPerScene: { min: 3, max: 6 },
    requiredFieldsPerShot: ['shot_type', 'description', 'visual_prompt', 'camera_movement', 'duration_seconds', 'composition_notes'],
    shotTypes: ['wide', 'medium', 'close_up', 'extreme_close_up', 'pov', 'over_shoulder', 'aerial'],
    cameraMovements: ['static', 'pan', 'tilt', 'tracking', 'dolly', 'crane', 'handheld', 'steadicam'],
    visualPromptLength: { min: 60, max: 300 },
    shotDurationSeconds: { min: 1, max: 15 },
  };

  if (isAlternative) {
    const existingStorylinesJson = existingStorylines.length > 0
      ? existingStorylines.map((s, i) => ({ index: i + 1, title: s.title, description: s.description }))
      : [];

    const alternativeRequest = {
      projectContext: projectContextJson,
      existingStorylines: existingStorylinesJson,
      task: 'Generate an ALTERNATIVE storyline that offers a completely different creative approach to the same project.',
      requirements: [
        'Take a different narrative angle or perspective than existing storylines',
        'Explore a different emotional tone, pacing, or story structure',
        'Consider alternative visual styles or cinematography approaches',
        'Maintain the core project requirements but be creatively bold and unique',
        'The title, concept, and approach MUST be distinctly different from existing versions',
      ],
    };

    return `INPUT (structured JSON):
${JSON.stringify(alternativeRequest, null, 2)}

Based on the structured input above, generate an ALTERNATIVE storyline that stands COMPLETELY APART from any previous storylines. Focus on creating a compelling alternative vision.`;
  }

  const shotPromptingOverride = trim(overrides?.shotPrompting);
  const annotated = trim(musicAnnotation?.annotatedLyrics);
  const selectedStems = (musicAnnotation?.selectedStems ?? [])
    .map((s) => s.stem)
    .filter(Boolean);

  const generationRequest: Record<string, unknown> = {
    projectContext: projectContextJson,
    sceneRequirements,
    task: 'Create a complete storyline with detailed scene breakdown and shot-by-shot visual planning.',
    deliverables: {
      primaryStoryline: {
        fields: ['title', 'description', 'full_story', 'visual_style_notes', 'cinematography_notes', 'tags'],
        storyLength: '3-5 engaging paragraphs',
      },
      sceneBreakdown: {
        sceneFields: sceneRequirements.requiredFieldsPerScene,
        shotFields: sceneRequirements.requiredFieldsPerShot,
        mandatoryShotsPerScene: `${sceneRequirements.shotsPerScene.min}-${sceneRequirements.shotsPerScene.max}`,
      },
    },
    visualPromptGuidelines: shotPromptingOverride
      ? { customOverride: shotPromptingOverride }
      : {
          required: ['art_style_or_medium', 'shot_type_and_angle', 'lighting', 'color_palette', 'composition', 'quality_keywords', 'mood_atmosphere'],
          goodExample: 'cinematic medium shot, woman walking through autumn park, golden hour side lighting, teal and orange color grade, fallen leaves framing, 35mm lens, shallow depth of field, professional photography, warm backlight, peaceful atmosphere',
          badExample: 'A person walking in a park',
          rules: [
            'Be specific and technical (60-300 characters)',
            'Front-load the most important visual elements',
            'Use proven AI image generation keywords',
            'Avoid vague terms like "beautiful", "nice", "good"',
            'Include camera and lens details when relevant (e.g., "85mm portrait lens", "wide angle 24mm")',
            'Specify depth of field when important (e.g., "shallow depth of field", "f/1.4", "bokeh background")',
          ],
        },
  };

  if (annotated || selectedStems.length > 0) {
    generationRequest.musicAnnotation = {
      selectedStems,
      annotatedLyricsExcerpt: annotated ? annotated.slice(0, 2400) : undefined,
      usageGuidance:
        'Use section headings (e.g. [Intro], [Chorus]) and instrumentation cues to drive shot pacing, energy peaks, and visual transitions. Map high-energy sections to dynamic shots and instrumental sections to performance/atmosphere shots.',
    };
  }

  return `INPUT (structured JSON):
${JSON.stringify(generationRequest, null, 2)}

Based on the structured input above, create a complete storyline with detailed scene breakdown. EVERY scene MUST have at least ${sceneRequirements.shotsPerScene.min} shots with fully populated visual prompts optimized for AI image generation.`;
}

export function getAnalysisSystemPrompt(): string {
  return `You are an expert story analyst and character profiler.

TASK: Analyze the provided story text and extract structured information:

1. **Characters**: Identify up to 8 main characters with:
   - Name
   - Description (2-3 sentences capturing personality, role, and key characteristics)

2. **Settings**: Extract environmental context:
   - Key locations mentioned
   - Time period (if specified)
   - Weather conditions referenced

3. **Genre & Tone**: Infer the:
   - Primary genre (if strongly indicated)
   - Overall tone (if clearly established)

ANALYSIS GUIDELINES:
- Base ALL findings strictly on the provided text
- Character descriptions should be detailed enough for visual reference
- Location names should be specific when mentioned
- Genre/tone should only be specified if clearly evident

Your response will follow the JSON schema provided automatically.`;
}

export function getAnalysisUserPrompt(fullStoryText: string): string {
  return `Analyze the following story:\n\n${fullStoryText}`;
}

/**
 * Prompt for streaming narrative text generation (pure prose, no JSON)
 */
export function getStoryNarrativeSystemPrompt(): string {
  return `You are a world-class screenwriter creating compelling narrative content for video production.

WRITING STYLE:
- Write vivid, cinematic prose that paints visual scenes
- Use present tense for immediacy
- Include sensory details (visual, auditory, atmospheric)
- Create emotional progression through the narrative
- Write in paragraphs, each covering a key story beat

OUTPUT FORMAT:
- Write 3-5 substantial paragraphs
- Each paragraph should be 3-5 sentences
- Separate paragraphs with double newlines
- Do NOT include any JSON, markdown formatting, or structural markers
- Write ONLY pure narrative prose`;
}

export function getStoryNarrativeUserPrompt(project: any): string {
  const narrativeInput: Record<string, unknown> = {
    title: project.title || 'Untitled',
    concept: project.concept_text || 'A creative story',
    genre: project.genre || 'dramatic',
    tone: project.tone || 'cinematic',
  };
  if (project.special_requests) {
    narrativeInput.specialRequests = project.special_requests;
  }
  if (project.format && project.format !== 'custom') {
    narrativeInput.format = project.format;
  }

  return `INPUT (structured JSON):
${JSON.stringify(narrativeInput, null, 2)}

Based on the structured input above, write the full story narrative now. Be vivid, engaging, and cinematic.`;
}

/**
 * Quick title generation prompt for instant skeleton
 */
export function getQuickTitlePrompt(project: any): string {
  const titleInput = {
    titleHint: project.title || 'Untitled',
    concept: project.concept_text || 'A creative story',
    genre: project.genre || 'dramatic',
  };

  return `INPUT (structured JSON):
${JSON.stringify(titleInput, null, 2)}

Based on the structured input above, generate a title and one-sentence description. Respond with JSON only: {"title": "...", "description": "..."}`;
}
