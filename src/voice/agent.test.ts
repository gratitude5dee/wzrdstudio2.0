import { describe, expect, it } from 'vitest';

import { createVoiceActionRegistry } from './actions/registry';
import { getVoiceInstructions, getVoiceToolDefinitions } from './agent';

describe('voice agent config', () => {
  it('returns non-empty instructions', () => {
    const instructions = getVoiceInstructions();
    expect(instructions).toContain('WorldStudio');
    expect(instructions.length).toBeGreaterThan(50);
  });

  it('returns tool definitions with the execute_worldstudio_action tool', () => {
    const registry = createVoiceActionRegistry();
    const tools = getVoiceToolDefinitions(registry);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('execute_worldstudio_action');
    expect(tools[0].type).toBe('function');
    expect(tools[0].parameters).toHaveProperty('properties');
  });
});
