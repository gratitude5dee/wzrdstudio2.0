import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ProjectData, ProjectSetupTab } from './types';
import { supabase } from '@/integrations/supabase/client';
import { supabaseService } from '@/services/supabaseService';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { extractInsufficientCreditsError, routeToBillingTopUp } from '@/lib/billing-errors';
import { buildConceptPayload } from '@/services/conceptPayloadService';
import { DEFAULT_EVALUATION_THRESHOLDS } from '@/lib/evaluation';
import { upsertProjectCharacterBlueprints } from '@/services/characterBlueprintService';

interface ProjectContextProps {
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
  activeTab: ProjectSetupTab;
  setActiveTab: (tab: ProjectSetupTab) => void;
  saveProjectData: (overrides?: Partial<ProjectData>) => Promise<string | null>;
  projectId: string | null;
  getVisibleTabs: () => ProjectSetupTab[];
  previousOption: 'ai' | 'manual';
  isCreating: boolean;
  setIsCreating: (creating: boolean) => void;
  isGenerating: boolean; 
  setIsGenerating: (generating: boolean) => void;
  isFinalizing: boolean; // New state for finalization process
  generateStoryline: (projectId: string, overrides?: Partial<ProjectData>) => Promise<boolean>;
  handleCreateProject: () => Promise<void>;
  finalizeProjectSetup: () => Promise<boolean>; // New method to invoke the orchestrator
  generationCompletedSignal: number;
}

const defaultProjectData: ProjectData = {
  title: 'Untitled Project',
  concept: '',
  genre: '',
  tone: '',
  format: 'custom',
  customFormat: '',
  specialRequests: '',
  addVoiceover: false,
  product: '',
  targetAudience: '',
  mainMessage: '',
  callToAction: '',
  conceptOption: 'ai',
  aspectRatio: '16:9',
  videoStyle: 'cinematic',
  adBrief: {
    product: '',
    targetAudience: '',
    mainMessage: '',
    callToAction: '',
    adDuration: '30s',
    platform: 'all',
    brandGuidelines: ''
  },
  musicVideoData: {
    artistName: '',
    trackTitle: '',
    genre: '',
    lyrics: '',
    performanceRatio: 50
  },
  infotainmentData: {
    topic: '',
    educationalGoals: [],
    targetDemographic: '',
    hostStyle: 'casual',
    segments: [],
    keyFacts: '',
    visualStyle: ''
  },
  shortFilmData: {
    genre: '',
    tone: '',
    duration: '',
    visualStyle: ''
  },
  voiceoverId: '',
  voiceoverName: '',
  voiceoverPreviewUrl: '',
  storylineTextModel: 'gmi/gemini-3.1-flash-lite',
  storylineTextSettings: {},
  baseImageModel: 'gmi/seedream-5.0-lite',
  baseVideoModel: 'gmi/ltx-fast-i2v',
  baseAudioModel: 'fal-ai/elevenlabs/tts/turbo-v2.5',
  evaluationMode: 'shadow',
  evaluationThresholds: DEFAULT_EVALUATION_THRESHOLDS,
  canonFacts: [],
  creativeConstraints: [],
};

const ProjectContext = createContext<ProjectContextProps | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ProjectSetupTab>('concept');
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false); // New state
  const [previousOption, setPreviousOption] = useState<'ai' | 'manual'>('ai');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<ProjectData>(defaultProjectData);
  const [generationCompletedSignal, setGenerationCompletedSignal] = useState(0);
  
  // Track option changes for smooth transitions
  useEffect(() => {
    if (previousOption !== projectData.conceptOption) {
      setPreviousOption(projectData.conceptOption);
      
      // If switching from AI to manual and currently on storyline tab, move to settings
      if (previousOption === 'ai' && projectData.conceptOption === 'manual' && activeTab === 'storyline') {
        setActiveTab('settings');
      }
    }
  }, [projectData.conceptOption, activeTab, previousOption]);
  
  const updateProjectData = (data: Partial<ProjectData>) => {
    setProjectData(prev => ({ ...prev, ...data }));
  };

  const saveProjectSettings = async (currentProjectId: string): Promise<void> => {
    const storylineSettings =
      projectData.storylineTextSettings && typeof projectData.storylineTextSettings === 'object'
        ? projectData.storylineTextSettings
        : {};

    const { error } = await (supabase
      .from('project_settings' as any)
      .upsert(
        {
          project_id: currentProjectId,
          storyline_text_model: projectData.storylineTextModel || 'gmi/gemini-3.1-flash-lite',
          storyline_text_settings: storylineSettings,
          base_image_model: projectData.baseImageModel || 'gmi/seedream-5.0-lite',
          base_video_model: projectData.baseVideoModel || 'gmi/ltx-fast-i2v',
          evaluation_mode: projectData.evaluationMode || 'shadow',
          evaluation_thresholds: projectData.evaluationThresholds || DEFAULT_EVALUATION_THRESHOLDS,
          canon_facts: projectData.canonFacts || [],
          creative_constraints: projectData.creativeConstraints || [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      ) as any);

    if (error) {
      throw error;
    }
  };

  // Save project data to Supabase
  const saveProjectData = async (overrides?: Partial<ProjectData>): Promise<string | null> => {
    if (!user) {
      toast.error("Please log in to create a project");
      return null;
    }

    // Merge overrides so voice-bridge can pass eager state that hasn't flushed to React yet
    const merged = overrides ? { ...projectData, ...overrides } : projectData;

    let currentProjectId = projectId;
    try {
      console.log('Saving project data:', merged);
      
      const projectPayload = {
        user_id: user.id,
        title: merged.title || 'Untitled Project',
        concept_text: merged.concept,
        concept_option: merged.conceptOption,
        format: merged.format,
        custom_format_description: merged.customFormat,
        genre: merged.genre,
        tone: merged.tone,
        add_voiceover: merged.addVoiceover,
        special_requests: merged.specialRequests,
        product_name: merged.product,
        target_audience: merged.targetAudience,
        main_message: merged.mainMessage,
        call_to_action: merged.callToAction,
        ad_brief_data: merged.adBrief,
        music_video_data: merged.musicVideoData,
        infotainment_data: merged.infotainmentData,
        short_film_data: merged.shortFilmData,
        voiceover_id: merged.voiceoverId,
        voiceover_name: merged.voiceoverName,
        voiceover_preview_url: merged.voiceoverPreviewUrl,
        style_reference_asset_id: merged.styleReferenceAssetId,
        // Add settings fields
        aspect_ratio: merged.aspectRatio,
        video_style: merged.videoStyle,
        cinematic_inspiration: merged.cinematicInspiration,
        // Custom format meta prompts (only persisted when format === 'custom')
        custom_meta_prompts: merged.format === 'custom' ? (merged.customMetaPrompts ?? null) : null,
      };
      
      console.log('Project payload:', projectPayload);

      // If project already exists, update it
      if (currentProjectId) {
        console.log(`Updating existing project ID: ${currentProjectId}`);
        await supabaseService.projects.update(currentProjectId, projectPayload);
        await saveProjectSettings(currentProjectId);
        
        toast.info("Project data saved");
        return currentProjectId;
      } else {
        // Create new project
        console.log('Creating new project...');
        const newProjectId = await supabaseService.projects.create(projectPayload);
        
        console.log(`New project created with ID: ${newProjectId}`);
        setProjectId(newProjectId);
        currentProjectId = newProjectId;
        window.history.replaceState({}, '', `/project-setup/${newProjectId}`);
        await saveProjectSettings(newProjectId);
        toast.success("Project created successfully");
        return newProjectId;
      }
    } catch (error: any) {
      console.error('Error saving project:', error);
      toast.error(`Failed to save project: ${error.message}`);
      return null;
    }
  };

  // Non-blocking storyline generation with streaming
  const generateStoryline = async (currentProjectId: string, overrides?: Partial<ProjectData>): Promise<boolean> => {
    if (!user) {
      toast.error("Please log in to generate storylines");
      return false;
    }
    
    if (!currentProjectId) {
      toast.error("Cannot generate storyline without a project ID");
      return false;
    }

    try {
      setIsGenerating(true);
      console.log(`Invoking generate-storylines for project: ${currentProjectId}`);
      
      // Build structured concept payload, merging overrides so voice-bridge eager state is used
      const merged = overrides ? { ...projectData, ...overrides } : projectData;
      const conceptPayload = buildConceptPayload(merged);

      // Non-blocking call - edge function returns immediately
      const { data, error } = await supabase.functions.invoke('generate-storylines', {
        body: { project_id: currentProjectId, concept_payload: conceptPayload }
      });
      
      if (error) {
        const insufficient = await extractInsufficientCreditsError(error);
        if (insufficient) {
          routeToBillingTopUp(insufficient);
          toast.error(
            `Insufficient credits. Required ${Math.ceil(insufficient.required)} / available ${Math.ceil(
              insufficient.available
            )}.`
          );
          return false;
        }
        console.error('Error invoking generate-storylines function:', error);
        toast.error(`Storyline generation failed: ${error.message}`);
        return false;
      }
      
      const responseInsufficient = await extractInsufficientCreditsError(data);
      if (responseInsufficient) {
        routeToBillingTopUp(responseInsufficient);
        toast.error(
          `Insufficient credits. Required ${Math.ceil(responseInsufficient.required)} / available ${Math.ceil(
            responseInsufficient.available
          )}.`
        );
        return false;
      }

      console.log('Storyline generation started:', data);
      
      // Immediate success - generation happening in background
      toast.success('Storyline generation started! Watch it appear in real-time.', {
        duration: 5000
      });
      
      return true; // Allow navigation immediately
      
    } catch (error: any) {
      console.error('Error in generateStoryline:', error);
      toast.error(`Storyline generation failed: ${error.message}`);
      return false;
    } finally {
      setIsGenerating(false); // Release immediately
    }
  };

  // Function to get visible tabs based on the conceptOption
  const getVisibleTabs = (): ProjectSetupTab[] => {
    if (projectData.conceptOption === 'manual') {
      // Skip storyline tab for manual mode
      return ['concept', 'settings', 'breakdown'];
    } else {
      // Show all tabs for AI mode
      return ['concept', 'storyline', 'settings', 'breakdown'];
    }
  };

  const handleCreateProject = async () => {
    if (!user) {
      toast.error("Please log in to create a project");
      return;
    }

    try {
      setIsCreating(true);
      
      // Save final project data if needed
      const savedProjectId = await saveProjectData();
      if (!savedProjectId) {
        throw new Error("Failed to save project data before completing setup");
      }
      
      toast.success("Project setup complete!");
      
      // Navigation happens in the NavigationFooter component
    } catch (error: any) {
      console.error('Error completing project setup:', error);
      toast.error(`Failed to complete project setup: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // New function to finalize project setup
  const finalizeProjectSetup = async (): Promise<boolean> => {
    if (!user) {
      toast.error("Please log in to create a project");
      return false;
    }

    if (!projectId) {
      toast.error("Project ID not found. Please save the project first.");
      return false;
    }

    setIsFinalizing(true);
    toast.info("Preparing your timeline, please wait...", { duration: 10000 }); // Longer duration

    try {
      // Ensure latest data is saved before finalizing
      const finalSaveId = await saveProjectData();
      
      if (!finalSaveId) {
        throw new Error("Failed to save final project settings.");
      }

      await upsertProjectCharacterBlueprints(projectId);

      console.log(`Invoking finalize-project-setup for project: ${projectId}`);
      
      // Build structured JSON payload with ALL prior step data using the shared conceptPayloadService
      const conceptPayload = buildConceptPayload(projectData);
      const structuredPayload = {
        project_id: projectId,
        concept: conceptPayload,
        storyline: {
          model: projectData.storylineTextModel || 'gmi/gemini-3.1-flash-lite',
          settings: projectData.storylineTextSettings || {},
        },
        settings: {
          aspectRatio: projectData.aspectRatio || '16:9',
          videoStyle: projectData.videoStyle || 'cinematic',
          cinematicInspiration: projectData.cinematicInspiration || null,
          baseImageModel: projectData.baseImageModel || 'gmi/seedream-5.0-lite',
          baseVideoModel: projectData.baseVideoModel || 'gmi/ltx-fast-i2v',
          styleReferenceAssetId: projectData.styleReferenceAssetId || null,
          evaluationMode: projectData.evaluationMode || 'shadow',
          evaluationThresholds: projectData.evaluationThresholds || DEFAULT_EVALUATION_THRESHOLDS,
          canonFacts: projectData.canonFacts || [],
          creativeConstraints: projectData.creativeConstraints || [],
        },
        cast: {
          addVoiceover: projectData.addVoiceover,
          voiceoverId: projectData.voiceoverId || null,
          voiceoverName: projectData.voiceoverName || null,
        },
      };

      const { data, error } = await supabase.functions.invoke('finalize-project-setup', {
        body: structuredPayload
      });

      if (error) {
        console.error('Error invoking finalize-project-setup:', error);
        throw new Error(error.message || "Failed to start timeline preparation.");
      }

      console.log('Finalize project setup response:', data);
      toast.success(data.message || "Timeline preparation started!");
      return true; // Indicate invocation success
    } catch (error: any) {
      console.error('Error finalizing project setup:', error);
      toast.error(`Timeline preparation failed: ${error.message}`);
      return false;
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <ProjectContext.Provider value={{
      projectData,
      updateProjectData,
      activeTab,
      setActiveTab,
      saveProjectData,
      projectId,
      getVisibleTabs,
      previousOption,
      isCreating,
      setIsCreating,
      isGenerating,
      setIsGenerating,
      isFinalizing,
      generateStoryline,
      handleCreateProject,
      finalizeProjectSetup,
      generationCompletedSignal
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};

export default ProjectProvider;
