import { useMemo } from 'react';
import { toast } from 'sonner';

import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { editBlueprintImage } from '@/services/characterBlueprintService';
import type { CharacterBlueprint, CharacterCreationMode } from '@/types/character-creation';
import { useRegisterVoiceActions } from '@/voice/VoiceAgentProvider';
import type { VoiceActionRegistration, VoiceActionResult } from '@/voice/actions/registry';

function normalizeName(value: string): string {
  return value.toLowerCase().trim().replace(/^@/, '').replace(/\s+/g, '-');
}

function resolveBlueprint(blueprints: CharacterBlueprint[], selectedId: string | null, name?: string | null) {
  if (!name?.trim()) {
    return selectedId ? blueprints.find((blueprint) => blueprint.id === selectedId) ?? null : null;
  }

  const normalized = normalizeName(name);
  return (
    blueprints.find((blueprint) => blueprint.id === name) ??
    blueprints.find((blueprint) => blueprint.slug === normalized) ??
    blueprints.find((blueprint) => normalizeName(blueprint.name) === normalized) ??
    null
  );
}

function invalid(message: string): VoiceActionResult {
  return { ok: false, status: 'invalid_input', message, errorCode: 'character_action_invalid' };
}

function isMode(value: unknown): value is CharacterCreationMode {
  return value === 'gallery' || value === 'builder' || value === 'detail';
}

export function CharacterCreationVoiceBridge() {
  const blueprints = useCharacterCreationStore((state) => state.blueprints);
  const selectedBlueprintId = useCharacterCreationStore((state) => state.selectedBlueprintId);
  const mode = useCharacterCreationStore((state) => state.mode);
  const setMode = useCharacterCreationStore((state) => state.setMode);
  const selectBlueprint = useCharacterCreationStore((state) => state.selectBlueprint);
  const updateBlueprint = useCharacterCreationStore((state) => state.updateBlueprint);
  const setGenerating = useCharacterCreationStore((state) => state.setGenerating);

  const actions = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: 'character_open',
        scope: 'character-creation',
        handler: (input) => {
          const payload = input as { mode?: CharacterCreationMode };
          const nextMode = isMode(payload.mode) ? payload.mode : 'gallery';
          setMode(nextMode);
          return {
            ok: true,
            status: 'completed',
            message: `Character ${nextMode} is open.`,
            data: { mode: nextMode },
          };
        },
      },
      {
        name: 'character_select',
        scope: 'character-creation',
        handler: (input) => {
          const payload = input as { name?: string | null };
          const blueprint = resolveBlueprint(blueprints, selectedBlueprintId, payload.name);
          if (!blueprint) {
            return invalid('I could not find that character. Which character should I use?');
          }
          selectBlueprint(blueprint.id);
          return {
            ok: true,
            status: 'completed',
            message: `${blueprint.name} is selected.`,
            data: { selectedBlueprintId: blueprint.id, mode: 'detail' },
          };
        },
      },
      {
        name: 'character_edit_image',
        scope: 'character-creation',
        confirmation: {
          risk: 'generation',
          message: 'This will spend credits to edit the selected character image. Should I continue?',
        },
        handler: async (input) => {
          const payload = input as {
            name?: string | null;
            edit_prompt?: string | null;
            prompt?: string | null;
            style_reference_url?: string | null;
          };
          const editPrompt = (payload.edit_prompt ?? payload.prompt ?? '').trim();
          if (!editPrompt) {
            return invalid('Tell me what to change about the character image.');
          }

          const blueprint = resolveBlueprint(blueprints, selectedBlueprintId, payload.name);
          if (!blueprint) {
            return invalid('I need a selected character before editing. Which character should I edit?');
          }

          setGenerating(true);
          try {
            const result = await editBlueprintImage({
              blueprint,
              editPrompt,
              styleReferenceUrl: payload.style_reference_url ?? undefined,
            });
            updateBlueprint(result.blueprint.id, result.blueprint);
            selectBlueprint(result.blueprint.id);
            toast.success(`${result.blueprint.name} image updated`);
            return {
              ok: true,
              status: 'completed',
              message: `${result.blueprint.name} was updated.`,
              data: { editedImageUrl: result.editedImageUrl, blueprintId: result.blueprint.id },
            };
          } finally {
            setGenerating(false);
          }
        },
      },
    ],
    [blueprints, selectBlueprint, selectedBlueprintId, setGenerating, setMode, updateBlueprint],
  );

  useRegisterVoiceActions(actions);
  return null;
}
