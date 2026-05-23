export type VoiceActionName =
  | 'get_app_context'
  | 'navigate_app'
  | 'start_new_project'
  | 'set_project_setup_fields'
  | 'project_setup_next'
  | 'storyline_update'
  | 'storyline_confirm'
  | 'settings_select_character'
  | 'settings_select_location'
  | 'settings_edit_selected_image'
  | 'breakdown_update_scene'
  | 'breakdown_start_storyboard'
  | 'timeline_select_shot'
  | 'timeline_open_shot'
  | 'timeline_update_shot_prompt'
  | 'timeline_generate_shot_image'
  | 'timeline_generate_all_images'
  | 'timeline_edit_shot_image'
  | 'timeline_start_directors_cut'
  | 'asset_store_save_current'
  | 'open_project_view'
  | 'kanvas_set_studio'
  | 'kanvas_generate'
  | 'character_open'
  | 'character_select'
  | 'character_edit_image'
  | 'open_ip_vault'
  | 'ip_vault_finalize_asset'
  | 'ip_vault_select_item'
  | 'ip_vault_set_license'
  | 'ip_vault_register_ip'
  | 'ip_vault_set_derivative'
  | 'ip_vault_claim_revenue'
  | 'studio_create_node'
  | 'studio_select_node';

export type VoiceActionStatus =
  | 'completed'
  | 'needs_confirmation'
  | 'unavailable'
  | 'invalid_input'
  | 'failed';

export type VoiceActionRisk = 'navigation' | 'write' | 'generation' | 'sensitive';

export interface VoiceActionConfirmation {
  actionName: VoiceActionName;
  risk: VoiceActionRisk;
  message: string;
  input: unknown;
}

export type VoiceActionResult =
  | {
      ok: true;
      status: 'completed';
      message: string;
      data?: unknown;
    }
  | {
      ok: false;
      status: Exclude<VoiceActionStatus, 'completed'>;
      message: string;
      data?: unknown;
      confirmation?: VoiceActionConfirmation;
      errorCode?: string;
    };

export interface VoiceActionExecutionContext {
  confirmed?: boolean;
  locationPath?: string;
  currentProjectId?: string | null;
}

export type VoiceActionHandler<Input = unknown> = (
  input: Input,
  context: VoiceActionExecutionContext,
) => VoiceActionResult | Promise<VoiceActionResult>;

export interface VoiceActionRegistration<Input = unknown> {
  name: VoiceActionName;
  scope: string;
  description?: string;
  confirmation?: {
    risk: VoiceActionRisk;
    message: string;
  };
  handler: VoiceActionHandler<Input>;
}

export interface VoiceActionRegistry {
  register: <Input = unknown>(registration: VoiceActionRegistration<Input>) => () => void;
  execute: (
    name: VoiceActionName,
    input?: unknown,
    context?: VoiceActionExecutionContext,
  ) => Promise<VoiceActionResult>;
  list: () => VoiceActionRegistration[];
  clear: () => void;
}

function cloneRegistrations(
  registrations: Map<VoiceActionName, VoiceActionRegistration[]>,
): VoiceActionRegistration[] {
  return Array.from(registrations.values()).flatMap((items) => [...items]);
}

export function createVoiceActionRegistry(): VoiceActionRegistry {
  const registrations = new Map<VoiceActionName, VoiceActionRegistration[]>();

  return {
    register(registration) {
      const current = registrations.get(registration.name) ?? [];
      const next = [...current, registration as VoiceActionRegistration];
      registrations.set(registration.name, next);

      return () => {
        const existing = registrations.get(registration.name) ?? [];
        const filtered = existing.filter((item) => item !== registration);
        if (filtered.length === 0) {
          registrations.delete(registration.name);
        } else {
          registrations.set(registration.name, filtered);
        }
      };
    },

    async execute(name, input = {}, context = {}) {
      const current = registrations.get(name) ?? [];
      const registration = current[current.length - 1];
      if (!registration) {
        return {
          ok: false,
          status: 'unavailable',
          message: `Voice action "${name}" is not available on this page.`,
          errorCode: 'voice_action_unavailable',
        };
      }

      if (registration.confirmation && !context.confirmed) {
        return {
          ok: false,
          status: 'needs_confirmation',
          message: registration.confirmation.message,
          confirmation: {
            actionName: name,
            risk: registration.confirmation.risk,
            message: registration.confirmation.message,
            input,
          },
        };
      }

      try {
        return await registration.handler(input, context);
      } catch (error) {
        return {
          ok: false,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Voice action failed.',
          errorCode: 'voice_action_failed',
        };
      }
    },

    list() {
      return cloneRegistrations(registrations);
    },

    clear() {
      registrations.clear();
    },
  };
}

export function voiceActionNeedsConfirmation(result: VoiceActionResult): boolean {
  return !result.ok && result.status === 'needs_confirmation' && Boolean(result.confirmation);
}

export const voiceActionRegistry = createVoiceActionRegistry();
