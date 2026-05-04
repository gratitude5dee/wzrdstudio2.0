import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { z } from 'zod';

import type {
  VoiceActionName,
  VoiceActionRegistry,
} from './actions/registry';

const VOICE_ACTION_NAMES = [
  'get_app_context',
  'navigate_app',
  'start_new_project',
  'set_project_setup_fields',
  'open_project_view',
  'kanvas_set_studio',
  'kanvas_generate',
  'character_open',
  'character_select',
  'character_edit_image',
  'studio_create_node',
  'studio_select_node',
] as const satisfies readonly VoiceActionName[];

export function createWzrdRealtimeAgent(registry: VoiceActionRegistry) {
  return new RealtimeAgent({
    name: 'WorldStudioOperator',
    voice: import.meta.env.VITE_WZRD_REALTIME_VOICE ?? 'ash',
    instructions: [
      'You are the voice operator for WorldStudio.',
      'Keep spoken responses short and action-oriented.',
      'Use the execute_worldstudio_action tool for navigation, UI state changes, project setup, Kanvas generation, character creation, and Studio graph actions.',
      'Do not describe app actions you can perform with a tool; call the tool.',
      'Navigation and local field changes can run immediately.',
      'If a tool returns needs_confirmation, ask the user to confirm in one short sentence. After they confirm, call the same action again with confirmed=true.',
      'If the user says "this character" and no character is selected, ask which character.',
      'For character image edits, keep the edit_prompt literal and specific, for example "make him wear a flannel".',
    ].join('\n'),
    tools: [
      tool({
        name: 'execute_worldstudio_action',
        description: 'Execute a typed WorldStudio app action such as navigation, project setup, Kanvas generation, character editing, or Studio graph control.',
        parameters: z.object({
          name: z.enum(VOICE_ACTION_NAMES),
          input: z.record(z.unknown()).nullable(),
          confirmed: z.boolean().nullable(),
        }),
        async execute({ name, input, confirmed }) {
          const result = await registry.execute(name, input ?? {}, { confirmed: confirmed ?? undefined });
          return JSON.stringify(result);
        },
      }),
    ],
  });
}
