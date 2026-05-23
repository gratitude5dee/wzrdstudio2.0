import {
  enhancePromptForImageGeneration,
  extractLayerArtifacts,
  extractSingleImageArtifact,
} from './image-edit.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('enhancePromptForImageGeneration leaves visual prompts unchanged', () => {
  const prompt = 'Cinematic portrait of an astronaut under neon rain';
  assertEquals(
    enhancePromptForImageGeneration(prompt),
    prompt,
    'Visual prompts should pass through unchanged'
  );
});

Deno.test('enhancePromptForImageGeneration converts task prompts into visual prompts', () => {
  const prompt = 'Create a content calendar for a coffee brand';
  const enhanced = enhancePromptForImageGeneration(prompt);

  assert(enhanced !== prompt, 'Task prompts should be enhanced');
  assert(
    enhanced.includes('artisan coffee shop'),
    'Enhanced prompt should include a derived coffee visual concept'
  );
});

Deno.test('extractSingleImageArtifact reads wrapped fal results', () => {
  const artifact = extractSingleImageArtifact({
    data: {
      images: [{ url: 'https://cdn.example.com/edited.png', name: 'Edited asset' }],
    },
    requestId: 'req-123',
  });

  assert(artifact, 'Expected an artifact to be extracted');
  assertEquals(artifact.url, 'https://cdn.example.com/edited.png', 'Should extract the image URL');
  assertEquals(artifact.name, 'Edited asset', 'Should preserve the returned name');
});

Deno.test('extractLayerArtifacts ignores non-url metadata and keeps layer names', () => {
  const layers = extractLayerArtifacts({
    requestId: 'req-123',
    data: {
      layers: [
        { url: 'https://cdn.example.com/layer-1.png', label: 'Foreground' },
        { url: 'https://cdn.example.com/layer-2.png', label: 'Background' },
      ],
    },
  });

  assertEquals(layers.length, 2, 'Should extract all returned layers');
  assertEquals(layers[0].name, 'Foreground', 'Should preserve the first layer name');
  assertEquals(layers[1].name, 'Background', 'Should preserve the second layer name');
});
