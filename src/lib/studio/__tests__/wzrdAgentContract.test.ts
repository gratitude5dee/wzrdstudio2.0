import { describe, expect, it } from 'vitest';
import {
  extractWzrdOpenAIText,
  normalizeWzrdProviderConfig,
  validateWzrdBlueprintContract,
} from '../../../../shared/wzrdAgentContract';

describe('WZRD Codex setup contract', () => {
  it('fails visibly when Codex is selected without OpenAI setup', () => {
    const config = normalizeWzrdProviderConfig({
      rawProvider: 'codex',
      model: '',
      hasOpenAIKey: false,
      hasGroqKey: true,
    });

    expect(config.ready).toBe(false);
    expect(config.provider).toBe('codex');
    expect(config.setupErrors).toEqual([
      'OPENAI_API_KEY is not configured in Supabase Edge Function secrets.',
      'WZRD_AGENT_MODEL is not configured in Supabase Edge Function secrets.',
    ]);
  });

  it('does not silently fall back to Groq for invalid provider configuration', () => {
    const config = normalizeWzrdProviderConfig({
      rawProvider: 'openai',
      model: 'gpt-5.3-codex',
      hasOpenAIKey: true,
      hasGroqKey: true,
    });

    expect(config.provider).toBe('codex');
    expect(config.ready).toBe(false);
    expect(config.setupErrors).toContain('WZRD_AGENT_PROVIDER must be "codex" or "groq"; received "openai".');
  });

  it('accepts explicit Groq fallback only when the Groq key is configured', () => {
    expect(normalizeWzrdProviderConfig({
      rawProvider: 'groq',
      model: 'llama-3.3-70b-versatile',
      hasGroqKey: false,
    }).setupErrors).toEqual(['GROQ_API_KEY is not configured in Supabase Edge Function secrets.']);

    expect(normalizeWzrdProviderConfig({
      rawProvider: 'groq',
      model: 'llama-3.3-70b-versatile',
      hasGroqKey: true,
    }).ready).toBe(true);
  });
});

describe('WZRD blueprint validation contract', () => {
  const actions = new Set(['generate-image', 'generate-video', 'analyze-audio']);
  const models = new Set(['fal-ai/flux-pro', 'fal-ai/kling-video', 'gmi-editor-model']);

  it('rejects invalid action IDs, invalid model IDs, and broken edges', () => {
    const errors = validateWzrdBlueprintContract(
      {
        nodes: [
          { actionId: 'generate-image', modelId: 'fal-ai/flux-pro' },
          { actionId: 'delete-project', modelId: 'fal-ai/unknown-model' },
        ],
        edges: [
          { from: 0, to: 4 },
          { from: 1, to: 1 },
        ],
      },
      actions,
      models
    );

    expect(errors).toEqual([
      'Node 1 uses unsupported actionId "delete-project".',
      'Node 1 uses model "fal-ai/unknown-model" that is not enabled in the model catalog.',
      'Edge 0 references a missing node.',
      'Edge 1 connects a node to itself.',
    ]);
  });

  it('rejects empty or malformed blueprints before materialization', () => {
    expect(validateWzrdBlueprintContract({}, actions, models)).toEqual([
      'Blueprint must include at least one node.',
    ]);
  });

  it('accepts a repaired schema-valid blueprint', () => {
    const errors = validateWzrdBlueprintContract(
      {
        nodes: [
          { actionId: 'analyze-audio', modelId: 'gmi-editor-model' },
          { actionId: 'generate-video', modelId: 'fal-ai/kling-video' },
        ],
        edges: [{ from: 0, to: 1 }],
      },
      actions,
      models
    );

    expect(errors).toEqual([]);
  });
});

describe('WZRD OpenAI response contract', () => {
  it('extracts structured text from current and nested Responses API shapes', () => {
    expect(extractWzrdOpenAIText({ output_text: '{"ok":true}' })).toBe('{"ok":true}');
    expect(extractWzrdOpenAIText({
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: '{"assistantMessage":"ready"}' },
          ],
        },
      ],
    })).toBe('{"assistantMessage":"ready"}');
  });

  it('returns null for bad OpenAI/model responses instead of fabricating fallback output', () => {
    expect(extractWzrdOpenAIText({ id: 'resp_missing_output', output: [] })).toBeNull();
    expect(extractWzrdOpenAIText({
      output: [
        { type: 'message', content: [{ type: 'refusal', refusal: 'model refused' }] },
      ],
    })).toBeNull();
  });
});
