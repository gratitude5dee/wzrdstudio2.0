import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_EVALUATION_THRESHOLDS,
  normalizeEvaluationThresholds,
  normalizeStringArray,
  type EvaluationMode,
  type EvaluationThresholds,
} from '@/lib/evaluation';
import {
  TEXT_MODELS as STUDIO_TEXT_MODELS,
  IMAGE_MODELS as STUDIO_IMAGE_MODELS,
  VIDEO_MODELS as STUDIO_VIDEO_MODELS,
  AUDIO_MODELS as STUDIO_AUDIO_MODELS,
  type StudioModel,
} from '@/lib/studio-model-constants';

export interface ProjectSettings {
  id: string;
  projectId: string;
  baseTextModel: string;
  baseImageModel: string;
  baseVideoModel: string;
  storylineTextModel: string;
  storylineTextSettings: Record<string, unknown>;
  baseAudioModel?: string;
  evaluationMode: EvaluationMode;
  evaluationThresholds: EvaluationThresholds;
  canonFacts: string[];
  creativeConstraints: string[];
  updatedAt: Date;
}

// Derive settings-friendly model lists from centralized constants
const toSettingsModel = (m: StudioModel) => ({
  id: m.id,
  name: m.name,
  provider: m.provider === 'lovable-ai' ? 'Lovable AI' : m.provider === 'gmi-cloud' ? 'GMI Cloud' : 'Fal',
  speed: m.time,
  badge: m.badge,
  category: m.category,
  workflowType: m.workflowType,
});

export const TEXT_MODELS = STUDIO_TEXT_MODELS.map(toSettingsModel);

export const STORYLINE_TEXT_MODELS = STUDIO_TEXT_MODELS
  .filter((m) => m.badge === 'Fast' || m.id.includes('flash'))
  .map(toSettingsModel);

// Only show generation models (not editing/advanced) in settings selectors
export const IMAGE_MODELS = STUDIO_IMAGE_MODELS
  .filter((m) => m.uiGroup === 'generation')
  .map(toSettingsModel);

export const VIDEO_MODELS = STUDIO_VIDEO_MODELS
  .filter((m) => m.uiGroup === 'generation')
  .map(toSettingsModel);

export const AUDIO_MODELS = STUDIO_AUDIO_MODELS.map(toSettingsModel);

interface ProjectSettingsState {
  settings: ProjectSettings | null;
  isLoading: boolean;
  error: string | null;

  fetchSettings: (projectId: string) => Promise<void>;
  updateSettings: (projectId: string, updates: Partial<ProjectSettings>) => Promise<void>;
  setBaseTextModel: (projectId: string, modelId: string) => Promise<void>;
  setBaseImageModel: (projectId: string, modelId: string) => Promise<void>;
  setBaseVideoModel: (projectId: string, modelId: string) => Promise<void>;
  setStorylineTextModel: (projectId: string, modelId: string) => Promise<void>;
  setStorylineTextSettings: (projectId: string, settings: Record<string, unknown>) => Promise<void>;
}

export const useProjectSettingsStore = create<ProjectSettingsState>()(
  persist(
    (set, get) => ({
      settings: null,
      isLoading: false,
      error: null,

      fetchSettings: async (projectId: string) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await (supabase
            .from('project_settings' as any)
            .select('*')
            .eq('project_id', projectId)
            .single() as any);

          if (error && error.code !== 'PGRST116') throw error;

          if (data) {
            const settingsData = data as any;
            set({
              settings: {
                id: settingsData.id,
                projectId: settingsData.project_id,
                baseTextModel: settingsData.base_text_model || 'gmi/gemini-3.1-flash-lite',
                baseImageModel: settingsData.base_image_model || 'gmi/seedream-5.0',
                baseVideoModel: settingsData.base_video_model || 'gmi/kling-v3-omni',
                storylineTextModel: settingsData.storyline_text_model || 'gmi/gemini-3.1-flash-lite',
                storylineTextSettings:
                  settingsData.storyline_text_settings &&
                  typeof settingsData.storyline_text_settings === 'object'
                    ? settingsData.storyline_text_settings
                    : {},
                baseAudioModel: settingsData.base_audio_model,
                evaluationMode:
                  settingsData.evaluation_mode === 'off' ||
                  settingsData.evaluation_mode === 'soft_gate' ||
                  settingsData.evaluation_mode === 'hard_gate'
                    ? settingsData.evaluation_mode
                    : 'shadow',
                evaluationThresholds: normalizeEvaluationThresholds(settingsData.evaluation_thresholds),
                canonFacts: normalizeStringArray(settingsData.canon_facts),
                creativeConstraints: normalizeStringArray(settingsData.creative_constraints),
                updatedAt: new Date(settingsData.updated_at),
              },
              isLoading: false,
            });
          } else {
            const { data: newData } = await (supabase
              .from('project_settings' as any)
              .insert({
                project_id: projectId,
                base_text_model: 'gmi/gemini-3.1-flash-lite',
                base_image_model: 'gmi/seedream-5.0',
                base_video_model: 'gmi/kling-v3-omni',
                storyline_text_model: 'gmi/gemini-3.1-flash-lite',
                storyline_text_settings: {},
                evaluation_mode: 'shadow',
                evaluation_thresholds: DEFAULT_EVALUATION_THRESHOLDS,
                canon_facts: [],
                creative_constraints: [],
              })
              .select()
              .single() as any);

            if (newData) {
              const newSettingsData = newData as any;
              set({
                settings: {
                  id: newSettingsData.id,
                  projectId: newSettingsData.project_id,
                  baseTextModel: newSettingsData.base_text_model,
                  baseImageModel: newSettingsData.base_image_model,
                  baseVideoModel: newSettingsData.base_video_model,
                  storylineTextModel: newSettingsData.storyline_text_model || 'gmi/gemini-3.1-flash-lite',
                  storylineTextSettings:
                    newSettingsData.storyline_text_settings &&
                    typeof newSettingsData.storyline_text_settings === 'object'
                      ? newSettingsData.storyline_text_settings
                      : {},
                  evaluationMode:
                    newSettingsData.evaluation_mode === 'off' ||
                    newSettingsData.evaluation_mode === 'soft_gate' ||
                    newSettingsData.evaluation_mode === 'hard_gate'
                      ? newSettingsData.evaluation_mode
                      : 'shadow',
                  evaluationThresholds: normalizeEvaluationThresholds(newSettingsData.evaluation_thresholds),
                  canonFacts: normalizeStringArray(newSettingsData.canon_facts),
                  creativeConstraints: normalizeStringArray(newSettingsData.creative_constraints),
                  updatedAt: new Date(newSettingsData.updated_at),
                },
                isLoading: false,
              });
            }
          }
        } catch (error: any) {
          set({ error: error.message, isLoading: false });
        }
      },

      updateSettings: async (projectId: string, updates: Partial<ProjectSettings>) => {
        try {
          const payload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (updates.baseTextModel !== undefined) payload.base_text_model = updates.baseTextModel;
          if (updates.baseImageModel !== undefined) payload.base_image_model = updates.baseImageModel;
          if (updates.baseVideoModel !== undefined) payload.base_video_model = updates.baseVideoModel;
          if (updates.baseAudioModel !== undefined) payload.base_audio_model = updates.baseAudioModel;
          if (updates.storylineTextModel !== undefined) {
            payload.storyline_text_model = updates.storylineTextModel;
          }
          if (updates.storylineTextSettings !== undefined) {
            payload.storyline_text_settings = updates.storylineTextSettings;
          }
          if (updates.evaluationMode !== undefined) {
            payload.evaluation_mode = updates.evaluationMode;
          }
          if (updates.evaluationThresholds !== undefined) {
            payload.evaluation_thresholds = updates.evaluationThresholds;
          }
          if (updates.canonFacts !== undefined) {
            payload.canon_facts = updates.canonFacts;
          }
          if (updates.creativeConstraints !== undefined) {
            payload.creative_constraints = updates.creativeConstraints;
          }

          const { error } = await (supabase
            .from('project_settings' as any)
            .update(payload)
            .eq('project_id', projectId) as any);

          if (error) throw error;

          set((state) => ({
            settings: state.settings ? { ...state.settings, ...updates } : null,
          }));
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      setBaseTextModel: async (projectId, modelId) => {
        await get().updateSettings(projectId, { baseTextModel: modelId });
      },

      setBaseImageModel: async (projectId, modelId) => {
        await get().updateSettings(projectId, { baseImageModel: modelId });
      },

      setBaseVideoModel: async (projectId, modelId) => {
        await get().updateSettings(projectId, { baseVideoModel: modelId });
      },

      setStorylineTextModel: async (projectId, modelId) => {
        await get().updateSettings(projectId, { storylineTextModel: modelId });
      },

      setStorylineTextSettings: async (projectId, settings) => {
        await get().updateSettings(projectId, { storylineTextSettings: settings });
      },
    }),
    {
      name: 'wzrd-project-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
