import { describe, expect, it } from 'vitest';

import { createVoiceActionRegistry } from './actions/registry';
import { createWzrdRealtimeAgent } from './agent';

describe('createWzrdRealtimeAgent', () => {
  it('creates the realtime agent with an SDK-compatible tool schema', () => {
    const agent = createWzrdRealtimeAgent(createVoiceActionRegistry());

    expect(agent.name).toBe('WorldStudioOperator');
  });
});
