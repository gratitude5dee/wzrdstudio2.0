/**
 * Voice agent configuration for the OpenAI Realtime API.
 *
 * Exports instructions and tool definitions in the raw Realtime API format
 * (no SDK dependency). The tool definitions are sent via `session.update`
 * on the WebRTC data channel.
 */

import type { VoiceActionName, VoiceActionRegistry } from './actions/registry';
import type { RealtimeToolDefinition } from './realtime/webrtcTransport';

const VOICE_ACTION_NAMES: readonly VoiceActionName[] = [
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
  'open_ip_vault',
  'ip_vault_finalize_asset',
  'ip_vault_select_item',
  'ip_vault_set_license',
  'ip_vault_register_ip',
  'ip_vault_set_derivative',
  'ip_vault_claim_revenue',
  'studio_create_node',
  'studio_select_node',
] as const;

export function getVoiceInstructions(): string {
  return [
    'You are the voice operator for WorldStudio.',
    'Keep spoken responses short and action-oriented.',
    'Use the execute_worldstudio_action tool for navigation, UI state changes, project setup, Kanvas generation, character creation, and Studio graph actions.',
    'Use IP Vault tools for rights management, Story Protocol registration, derivative settings, and royalty claims.',
    'Do not describe app actions you can perform with a tool; call the tool.',
    'Navigation and local field changes can run immediately.',
    'If a tool returns needs_confirmation, ask the user to confirm in one short sentence. After they confirm, call the same action again with confirmed=true.',
    'If the user says "this character" and no character is selected, ask which character.',
    'For character image edits, keep the edit_prompt literal and specific, for example "make him wear a flannel".',
    'Treat Story Protocol registration, license attachment, derivative registration, and royalty claims as wallet-confirmed actions. Report only short status updates.',
  ].join('\n');
}

export function getVoiceToolDefinitions(_registry: VoiceActionRegistry): RealtimeToolDefinition[] {
  return [
    {
      type: 'function',
      name: 'execute_worldstudio_action',
      description:
        'Execute a typed WorldStudio app action such as navigation, project setup, Kanvas generation, character editing, or Studio graph control.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: [...VOICE_ACTION_NAMES],
            description: 'The action to execute.',
          },
          input: {
            type: 'object',
            description: 'Action-specific input parameters.',
            additionalProperties: true,
            nullable: true,
          },
          confirmed: {
            type: 'boolean',
            nullable: true,
            description: 'Set to true after the user confirms a confirmation-required action.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  ];
}
