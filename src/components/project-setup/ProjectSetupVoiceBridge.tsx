import { useMemo } from 'react';

import { useRegisterVoiceActions } from '@/voice/VoiceAgentProvider';
import type { VoiceActionRegistration } from '@/voice/actions/registry';

import { useProjectContext } from './ProjectContext';
import type { ProjectData, ProjectSetupTab } from './types';

function isProjectSetupTab(value: unknown): value is ProjectSetupTab {
  return value === 'concept' || value === 'storyline' || value === 'settings' || value === 'breakdown';
}

export function ProjectSetupVoiceBridge() {
  const {
    projectData,
    updateProjectData,
    activeTab,
    setActiveTab,
    saveProjectData,
    generateStoryline,
    finalizeProjectSetup,
    projectId,
  } = useProjectContext();

  const actions = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: 'set_project_setup_fields',
        scope: 'project-setup',
        handler: async (input, context) => {
          const payload = input as Partial<ProjectData> & {
            tab?: ProjectSetupTab;
            save?: boolean;
            generateStoryline?: boolean;
            finalize?: boolean;
          };

          const { tab, save, generateStoryline: shouldGenerateStoryline, finalize, ...fields } = payload;
          if (Object.keys(fields).length > 0) {
            updateProjectData(fields);
          }
          if (isProjectSetupTab(tab)) {
            setActiveTab(tab);
          }

          if ((save || shouldGenerateStoryline || finalize) && !context.confirmed) {
            return {
              ok: false,
              status: 'needs_confirmation',
              message: 'This will save or generate project data. Should I continue?',
              confirmation: {
                actionName: 'set_project_setup_fields',
                risk: shouldGenerateStoryline || finalize ? 'generation' : 'write',
                message: 'This will save or generate project data. Should I continue?',
                input,
              },
            };
          }

          let savedProjectId = projectId;
          if (save || shouldGenerateStoryline || finalize) {
            savedProjectId = await saveProjectData();
          }
          if (shouldGenerateStoryline && savedProjectId) {
            await generateStoryline(savedProjectId);
          }
          if (finalize) {
            await finalizeProjectSetup();
          }

          return {
            ok: true,
            status: 'completed',
            message: `Project setup updated on ${tab ?? activeTab}.`,
            data: { projectId: savedProjectId, projectData },
          };
        },
      },
    ],
    [
      activeTab,
      finalizeProjectSetup,
      generateStoryline,
      projectData,
      projectId,
      saveProjectData,
      setActiveTab,
      updateProjectData,
    ],
  );

  useRegisterVoiceActions(actions);
  return null;
}
