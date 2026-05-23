export interface ImageEditArtifact {
  url: string;
  name?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asUrl(value: unknown): string | null {
  const stringValue = asString(value);
  if (!stringValue) {
    return null;
  }

  return /^(https?:\/\/|data:|blob:)/i.test(stringValue) ? stringValue : null;
}

function artifactFromRecord(record: Record<string, unknown>, fallbackName?: string): ImageEditArtifact | null {
  const directUrl =
    asUrl(record.url) ??
    asUrl(record.image_url) ??
    asUrl(record.file_url) ??
    asUrl(record.public_url) ??
    asUrl(record.output_url);

  const name =
    asString(record.name) ??
    asString(record.label) ??
    asString(record.title) ??
    asString(record.file_name) ??
    asString(record.filename) ??
    fallbackName;

  if (directUrl) {
    return name ? { url: directUrl, name } : { url: directUrl };
  }

  for (const key of ['image', 'images', 'asset', 'file', 'output', 'outputs', 'result', 'layers']) {
    const nested = artifactFromUnknown(record[key], name ?? fallbackName);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function artifactFromUnknown(value: unknown, fallbackName?: string): ImageEditArtifact | null {
  const directUrl = asUrl(value);
  if (directUrl) {
    return fallbackName ? { url: directUrl, name: fallbackName } : { url: directUrl };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const artifact = artifactFromUnknown(item, fallbackName);
      if (artifact) {
        return artifact;
      }
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return artifactFromRecord(record, fallbackName);
}

function collectArtifactsFromUnknown(value: unknown, defaultNamePrefix: string): ImageEditArtifact[] {
  if (!value) {
    return [];
  }

  const artifacts: ImageEditArtifact[] = [];
  const seen = new Set<string>();

  const pushArtifact = (artifact: ImageEditArtifact | null, index: number) => {
    if (!artifact || seen.has(artifact.url)) {
      return;
    }

    seen.add(artifact.url);
    artifacts.push({
      url: artifact.url,
      name: artifact.name ?? `${defaultNamePrefix} ${index + 1}`,
    });
  };

  if (Array.isArray(value)) {
    value.forEach((item, index) => pushArtifact(artifactFromUnknown(item, `${defaultNamePrefix} ${index + 1}`), index));
    return artifacts;
  }

  const record = asRecord(value);
  if (!record) {
    return artifacts;
  }

  const entries = Object.entries(record);
  entries.forEach(([key, item], index) => {
    if (['data', 'output', 'result'].includes(key)) {
      return;
    }
    pushArtifact(artifactFromUnknown(item, key), index);
  });

  return artifacts;
}

export function extractSingleImageArtifact(result: unknown, fallbackName?: string): ImageEditArtifact | null {
  const root = asRecord(result);
  const candidates: unknown[] = [
    result,
    root?.data,
    root?.image,
    root?.asset,
    root?.file,
    root?.output,
    root?.result,
    root?.images,
    root?.outputs,
  ];

  for (const candidate of candidates) {
    const artifact = artifactFromUnknown(candidate, fallbackName);
    if (artifact) {
      return artifact;
    }
  }

  return null;
}

export function extractLayerArtifacts(result: unknown): ImageEditArtifact[] {
  const root = asRecord(result);
  const data = asRecord(root?.data);
  const output = asRecord(root?.output);
  const nestedResult = asRecord(root?.result);

  const candidates: unknown[] = [
    result,
    root?.layers,
    root?.rgba_layers,
    root?.images,
    root?.outputs,
    data?.layers,
    data?.rgba_layers,
    data?.images,
    data?.outputs,
    output?.layers,
    output?.rgba_layers,
    output?.images,
    output?.outputs,
    nestedResult?.layers,
    nestedResult?.rgba_layers,
    nestedResult?.images,
    nestedResult?.outputs,
  ];

  for (const candidate of candidates) {
    const artifacts = collectArtifactsFromUnknown(candidate, 'Layer');
    if (artifacts.length > 0) {
      return artifacts;
    }
  }

  return [];
}

export function enhancePromptForImageGeneration(prompt: string): string {
  const taskPatterns = [
    /^(create|generate|make|build|develop|write|design|produce|craft)\s+(a\s+)?(content|marketing|social|brand|campaign|strategy|plan|calendar|schedule|ideas?)/i,
    /^(determine|analyze|identify|find|discover|research|explore)\s+/i,
    /^(for|based on|using)\s+(the|a|an)?\s*(audience|customer|user|market)/i,
    /content\s+(ideas?|calendar|strategy|plan)/i,
    /marketing\s+(content|strategy|plan|ideas?)/i,
    /social\s+media\s+(content|post|strategy)/i,
  ];

  const isTaskPrompt = taskPatterns.some((pattern) => pattern.test(prompt));
  if (!isTaskPrompt) {
    return prompt;
  }

  const themes = extractThemesFromTask(prompt);
  return buildVisualPromptFromThemes(themes, prompt);
}

function extractThemesFromTask(prompt: string): string[] {
  const themes: string[] = [];
  const subjectMatches = prompt.match(/(?:for|about|featuring|showing|depicting)\s+([^,.]+)/gi);

  if (subjectMatches) {
    themes.push(
      ...subjectMatches.map((match) =>
        match.replace(/^(for|about|featuring|showing|depicting)\s+/i, '').trim()
      )
    );
  }

  if (/coffee/i.test(prompt)) themes.push('artisan coffee shop, latte art, warm lighting');
  if (/restaurant|food/i.test(prompt)) themes.push('gourmet food presentation, fine dining');
  if (/tech|software|app/i.test(prompt)) themes.push('modern tech workspace, clean design');
  if (/fashion|clothing/i.test(prompt)) themes.push('stylish fashion photography, elegant models');
  if (/fitness|gym|health/i.test(prompt)) themes.push('athletic person working out, energetic motion');
  if (/travel|vacation/i.test(prompt)) themes.push('scenic travel destination, wanderlust adventure');
  if (/marketing|brand/i.test(prompt)) themes.push('professional business setting, modern office');

  return themes;
}

function buildVisualPromptFromThemes(themes: string[], originalPrompt: string): string {
  const baseElements =
    themes.length > 0 ? themes.slice(0, 3).join(', ') : 'professional business concept illustration';

  const styleModifiers = [
    'high quality',
    'professional photography',
    'vibrant colors',
    'excellent composition',
    'sharp focus',
  ];

  const visualPrompt = `${baseElements}, ${styleModifiers.slice(0, 3).join(', ')}`;
  console.log(
    `[image-edit] Converted task prompt to visual: "${originalPrompt.substring(0, 40)}..." -> "${visualPrompt}"`
  );

  return visualPrompt;
}
