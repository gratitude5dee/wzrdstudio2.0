import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, AlertCircle, Film, Sparkles, CircleStop, Scissors } from 'lucide-react';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { motion, AnimatePresence } from 'framer-motion';
import AppHeader from '@/components/AppHeader';
import { SettingsPanel } from '@/components/studio/panels/SettingsPanel';
import EnhancedStoryboardSidebar from '@/components/storyboard/EnhancedStoryboardSidebar';
import { GlowingTitle } from '@/components/timeline/GlowingTitle';
import ShotsRow from '@/components/storyboard/ShotsRow';
import { AddSceneButton } from '@/components/timeline/AddSceneButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAppStore } from '@/store/appStore';
import { ProjectDetails, SceneDetails, CharacterDetails, SidebarData } from '@/types/storyboardTypes';
import { cn } from '@/lib/utils';
import { useProjectAutoGenerate } from '@/hooks/useProjectAutoGenerate';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { appRoutes } from '@/lib/routes';
import { getShotImageCredits, getShotVideoCredits, DIRECTORS_CUT_CREDITS } from '@/lib/constants/credits';
import { useProjectSettingsStore } from '@/store/projectSettingsStore';
import { ConfirmGenerateDialog } from '@/components/ui/ConfirmGenerateDialog';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { PanelLeft } from 'lucide-react';

const StoryboardPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { setActiveProject } = useAppStore();
  const isMobile = useIsMobile();
  
  const [scenes, setScenes] = useState<SceneDetails[]>([]);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [characters, setCharacters] = useState<CharacterDetails[]>([]);
  const [selectedScene, setSelectedScene] = useState<SceneDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarData, setSidebarData] = useState<SidebarData | null>(null);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [showProjectConfirmGenerate, setShowProjectConfirmGenerate] = useState(false);
  const [showDirectorsCutConfirm, setShowDirectorsCutConfirm] = useState(false);
  const [openReviewTaskCount, setOpenReviewTaskCount] = useState(0);
  // Get user-selected models from project settings store
  const { settings: projectSettings, fetchSettings: fetchProjectSettings } = useProjectSettingsStore();
  const selectedImageModel = projectSettings?.baseImageModel;
  const selectedVideoModel = projectSettings?.baseVideoModel;

  // Project-level auto-generate for all shots across all scenes
  const {
    state: projectAutoGenState,
    generationCounts,
    startAutoGenerate: startProjectAutoGenerate,
    cancelAutoGenerate: cancelProjectAutoGenerate,
    nextPhase: projectNextPhase,
    isProcessing: isProjectAutoGenerating,
    fetchAllProjectShots
  } = useProjectAutoGenerate(projectId || '');
  const estimatedProjectShotCount = generationCounts.totalShots || projectAutoGenState.progress.total || scenes.length * 3;
  const pendingProjectGenerationCount = generationCounts.totalShots > 0
    ? projectNextPhase === 'images'
      ? generationCounts.missingImages
      : generationCounts.missingVideos
    : projectAutoGenState.progress.total || estimatedProjectShotCount;
  
  // Validate that we have a projectId and fetch project settings
  useEffect(() => {
    if (!projectId) {
      toast.error('No project ID specified');
      navigate(appRoutes.home);
      return;
    }
    // Fetch project settings to get user-selected models for credit display
    fetchProjectSettings(projectId).catch(() => undefined);
  }, [projectId, navigate, fetchProjectSettings]);

  // Memoize fetchData to prevent unnecessary re-renders
  const fetchData = useCallback(async () => {
    if (!projectId) {
      toast.error("Project ID not found. Redirecting to home page.");
      setIsLoading(false);
      navigate(appRoutes.home);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch project, scenes, and characters in parallel
      const [projectRes, scenesRes, charactersRes] = await Promise.all([
        supabase.from('projects').select('id, title, description, video_style').eq('id', projectId).single(),
        supabase.from('scenes').select('*').eq('project_id', projectId).order('scene_number', { ascending: true }),
        supabase.from('characters').select('*').eq('project_id', projectId)
      ]);

      // Process Project
      if (projectRes.error) {
        throw new Error(projectRes.error.message || 'Failed to fetch project details.');
      }
      const fetchedProject = projectRes.data as ProjectDetails;
      setProjectDetails(fetchedProject);
      
      // Update the global app state with the project details
      setActiveProject(projectId, fetchedProject.title || 'Untitled');
      
      console.log("StoryboardPage: Fetched Project:", fetchedProject);

      // Process Scenes
      if (scenesRes.error) {
        throw new Error(scenesRes.error.message || 'Failed to fetch scenes.');
      }
      const fetchedScenes = (scenesRes.data || []) as SceneDetails[];
      setScenes(fetchedScenes);
      console.log(`StoryboardPage: Fetched ${fetchedScenes.length} Scenes:`, fetchedScenes);

      // Set initial selected scene - prefer scene 1 if it exists
      const initialScene = fetchedScenes.find(s => s.scene_number === 1) || 
                          (fetchedScenes.length > 0 ? fetchedScenes[0] : null);
      setSelectedScene(initialScene);
      console.log("StoryboardPage: Initial Selected Scene:", initialScene);

      // Process Characters
      if (charactersRes.error) {
        throw new Error(charactersRes.error.message || 'Failed to fetch characters.');
      }
      const fetchedCharacters = (charactersRes.data || []) as CharacterDetails[];
      setCharacters(fetchedCharacters);
      console.log(`StoryboardPage: Fetched ${fetchedCharacters.length} Characters:`, fetchedCharacters);

      // Prepare Initial Sidebar Data
      setSidebarData({
        projectTitle: fetchedProject.title,
        projectDescription: fetchedProject.description,
        sceneDescription: initialScene?.description ?? null,
        sceneLocation: initialScene?.location ?? null,
        sceneLighting: initialScene?.lighting ?? null,
        sceneWeather: initialScene?.weather ?? null,
        videoStyle: fetchedProject.video_style ?? null,
        characters: fetchedCharacters
      });
      console.log("StoryboardPage: Initial Sidebar Data Set");

      // If there are no scenes, show a toast to help guide the user
      if (fetchedScenes.length === 0) {
        toast.info("No scenes found. You can add a scene using the + button.", {
          duration: 5000,
        });
      }

    } catch (error: any) {
      console.error("Error fetching storyboard data:", error);
      toast.error(`Failed to load storyboard: ${error.message}`);
      setProjectDetails(null);
      setScenes([]);
      setCharacters([]);
      setSelectedScene(null);
      setSidebarData(null);
    } finally {
      setIsLoading(false);
      console.log("StoryboardPage: Fetching complete.");
    }
  }, [projectId, navigate, setActiveProject]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch all project shots for the auto-generate hook when scenes are loaded
  useEffect(() => {
    if (scenes.length > 0 && projectId) {
      fetchAllProjectShots();
    }
  }, [scenes.length, projectId, fetchAllProjectShots]);

  // Set up realtime subscriptions to scenes and shots
  useEffect(() => {
    if (!projectId) return;
    
    console.log(`StoryboardPage: Setting up realtime subscriptions for project: ${projectId}`);
    
    // Subscribe to scene changes
    const scenesChannel = supabase
      .channel('scenes_channel')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'scenes',
          filter: `project_id=eq.${projectId}`
        }, 
        async (payload) => {
          console.log('Scenes realtime update:', payload);
          
          // Refresh the entire scene list on any change
          // This is simpler than trying to merge changes
          await fetchData();
          
          // Show a toast based on the event type
          if (payload.eventType === 'INSERT') {
            toast.success('New scene added');
          } else if (payload.eventType === 'UPDATE') {
            toast.success('Scene updated');
          } else if (payload.eventType === 'DELETE') {
            toast.info('Scene deleted');
          }
        })
      .subscribe();
      
    // Clean up subscriptions
    return () => {
      supabase.removeChannel(scenesChannel);
    };
  }, [projectId, fetchData]);

  useEffect(() => {
    if (!projectId) return;

    const fetchOpenReviewTasks = async () => {
      const { count, error } = await supabase
        .from('review_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['open', 'in_review']);

      if (!error) {
        setOpenReviewTaskCount(count ?? 0);
      }
    };

    void fetchOpenReviewTasks();

    const reviewChannel = supabase
      .channel(`review_tasks_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'review_tasks',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void fetchOpenReviewTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reviewChannel);
    };
  }, [projectId]);

  // Function to update scene details in the database
  const handleSceneUpdate = async (sceneId: string | undefined, updates: Partial<Omit<SceneDetails, 'id' | 'project_id' | 'scene_number'>>) => {
    if (!sceneId) {
      toast.error("Cannot update scene: Scene ID is missing.");
      return;
    }
    try {
      const { error } = await supabase
        .from('scenes')
        .update(updates as any)
        .eq('id', sceneId);
      if (error) throw error;

      // Update local state for immediate feedback
      setSelectedScene(prev => prev ? { ...prev, ...updates } : null);
      setScenes(prevScenes => prevScenes.map(s => s.id === sceneId ? { ...s, ...updates } : s));
      setSidebarData(prev => prev ? {
        ...prev,
        sceneDescription: updates.description ?? prev.sceneDescription,
        sceneLocation: updates.location ?? prev.sceneLocation,
        sceneLighting: updates.lighting ?? prev.sceneLighting,
        sceneWeather: updates.weather ?? prev.sceneWeather,
      } : null);

    } catch (error: any) {
      console.error("Error updating scene:", error);
      toast.error(`Failed to update scene: ${error.message}`);
    }
  };

  const handleProjectUpdate = async (updates: { title?: string; description?: string }) => {
    if (!projectId) return;
    try {
      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId);
      if (error) throw error;
      setProjectDetails(prev => prev ? { ...prev, ...updates } : null);
      setSidebarData(prev => prev ? {
        ...prev,
        projectTitle: updates.title ?? prev.projectTitle,
        projectDescription: updates.description ?? prev.projectDescription,
      } : null);
    } catch (error: any) {
      console.error("Error updating project:", error);
      toast.error(`Failed to update project: ${error.message}`);
    }
  };

  // Add scene function
  const addScene = async () => {
    if (!projectId) return;
    const newSceneNumber = scenes.length > 0 ? Math.max(...scenes.map(s => s.scene_number)) + 1 : 1;
    try {
      const { data, error } = await supabase
        .from('scenes')
        .insert({ project_id: projectId, scene_number: newSceneNumber, title: `Scene ${newSceneNumber}` })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setScenes(prev => [...prev, data as SceneDetails]);
        toast.success(`Scene ${newSceneNumber} added.`);
      }
    } catch (error: any) {
      console.error("Error adding scene:", error);
      toast.error(`Failed to add scene: ${error.message}`);
    }
  };

  // Function to handle selecting a different scene
  const handleSelectScene = (scene: SceneDetails) => {
    setSelectedScene(scene);
    // Update sidebar data when scene changes
    setSidebarData(prev => projectDetails ? ({
      projectTitle: projectDetails.title,
      projectDescription: projectDetails.description,
      sceneDescription: scene.description ?? null,
      sceneLocation: scene.location ?? null,
      sceneLighting: scene.lighting ?? null,
      sceneWeather: scene.weather ?? null,
      videoStyle: projectDetails.video_style ?? null,
      characters: characters
    }) : null);
  };

  // Function to handle deleting a scene
  const handleDeleteScene = async (sceneId: string) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase
        .from('scenes')
        .delete()
        .eq('id', sceneId)
        .eq('project_id', projectId);
      
      if (error) throw error;
      
      // Update local state to remove the deleted scene
      setScenes(prev => prev.filter(scene => scene.id !== sceneId));
      
      // If the deleted scene was selected, select another scene or null
      if (selectedScene?.id === sceneId) {
        const remainingScenes = scenes.filter(scene => scene.id !== sceneId);
        setSelectedScene(remainingScenes.length > 0 ? remainingScenes[0] : null);
        
        // Update sidebar data if needed
        if (remainingScenes.length > 0 && projectDetails) {
          const nextScene = remainingScenes[0];
          setSidebarData({
            projectTitle: projectDetails.title,
            projectDescription: projectDetails.description,
            sceneDescription: nextScene.description ?? null,
            sceneLocation: nextScene.location ?? null,
            sceneLighting: nextScene.lighting ?? null,
            sceneWeather: nextScene.weather ?? null,
            videoStyle: projectDetails.video_style ?? null,
            characters: characters
          });
        }
      }
      
      toast.success('Scene deleted');
    } catch (error: any) {
      console.error("Error deleting scene:", error);
      toast.error(`Failed to delete scene: ${error.message}`);
      throw error; // Re-throw so ShotsRow can handle it
    }
  };

  // Render logic
  if (isLoading && !projectDetails) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090909] text-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#d4a574]" />
        <span className="ml-3">Loading Storyboard...</span>
      </div>
    );
  }

  if (!projectDetails && !isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#090909] p-6 text-white">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Project</h2>
        <p className="text-zinc-400 mb-6">Could not load project data. The project ID might be missing or invalid.</p>
        <Button onClick={() => navigate('/home')}>Go to Projects</Button>
      </div>
    );
  }

  const sidebarNode = sidebarData ? (
    <EnhancedStoryboardSidebar
      key={selectedScene?.id || 'no-scene'}
      data={sidebarData}
      sceneId={selectedScene?.id || ''}
      onUpdate={(updates) => handleSceneUpdate(selectedScene?.id, updates)}
      onProjectUpdate={handleProjectUpdate}
    />
  ) : (
    <div className="p-6 text-zinc-500">Loading sidebar...</div>
  );

  const mainContent = (
    <div className="p-3 md:p-6 h-full overflow-y-auto relative">
      {projectDetails && (
        <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0 h-10 w-10 border-zinc-800 bg-[#141414]">
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[88vw] max-w-sm p-0 bg-[#0a0a0a] border-zinc-800">
                  <SheetHeader className="p-4 border-b border-zinc-800">
                    <SheetTitle className="text-white text-left">Scene Details</SheetTitle>
                  </SheetHeader>
                  <div className="h-[calc(100vh-65px)] overflow-y-auto">{sidebarNode}</div>
                </SheetContent>
              </Sheet>
            )}
            <GlowingTitle title={projectDetails.title} glowColor="#d4a574" />
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {projectId ? (
              <Button
                variant="outline"
                size={isMobile ? 'sm' : 'default'}
                onClick={() => navigate(appRoutes.projects.observability(projectId))}
                className="border-amber-400/20 bg-[#141414] text-zinc-100 hover:bg-[#1a1a1a] min-h-[40px]"
              >
                <AlertCircle className="mr-2 h-4 w-4 text-amber-300" />
                <span className="hidden sm:inline">Observability</span>
                <span className="sm:hidden">Obs</span>
                {openReviewTaskCount > 0 ? (
                  <Badge variant="destructive" className="ml-2">
                    {openReviewTaskCount}
                  </Badge>
                ) : null}
              </Button>
            ) : null}

            {projectId && (
              <Button
                size={isMobile ? 'sm' : 'default'}
                onClick={() => setShowDirectorsCutConfirm(true)}
                className={cn(
                  'relative overflow-hidden backdrop-blur-sm px-3 md:px-5 py-2 min-h-[40px]',
                  'bg-[#151515] border border-[rgba(249,115,22,0.15)] text-zinc-100',
                  'hover:border-[rgba(249,115,22,0.25)] hover:bg-[#1a1a1a]'
                )}
              >
                <Scissors className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">Director&apos;s Cut ({DIRECTORS_CUT_CREDITS} credits)</span>
                <span className="ml-2 sm:hidden">Cut</span>
              </Button>
            )}

            {scenes.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size={isMobile ? 'sm' : 'default'}
                    onClick={isProjectAutoGenerating ? cancelProjectAutoGenerate : () => setShowProjectConfirmGenerate(true)}
                    className={cn(
                      'relative overflow-hidden px-3 md:px-6 py-2 min-h-[40px]',
                      'bg-[#151210] border border-[rgba(249,115,22,0.15)] text-orange-50',
                      'hover:border-[rgba(249,115,22,0.3)] hover:bg-[#1b1b1b]'
                    )}
                  >
                    {isProjectAutoGenerating ? (
                      <>
                        <CircleStop className="h-4 w-4" />
                        <span className="ml-2">Stop {projectAutoGenState.progress.completed}/{projectAutoGenState.progress.total}</span>
                      </>
                    ) : projectNextPhase === 'images' ? (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span className="ml-2 hidden sm:inline">Generate Missing Images ({getShotImageCredits(selectedImageModel) * pendingProjectGenerationCount} credits)</span>
                        <span className="ml-2 sm:hidden">Images</span>
                      </>
                    ) : (
                      <>
                        <Film className="h-4 w-4" />
                        <span className="ml-2 hidden sm:inline">Generate Missing Videos ({getShotVideoCredits(selectedVideoModel) * pendingProjectGenerationCount} credits)</span>
                        <span className="ml-2 sm:hidden">Videos</span>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="glass-panel border-zinc-700 max-w-xs">
                  <p className="text-xs">
                    {isProjectAutoGenerating
                      ? 'Cancel the current project-wide generation queue'
                      : projectNextPhase === 'images'
                      ? `Generate missing images for ${pendingProjectGenerationCount} shot(s)`
                      : `Generate missing videos for ${pendingProjectGenerationCount} shot(s)`}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}
      {scenes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className={cn(
            'text-center mt-12 md:mt-20 max-w-md mx-auto p-6 md:p-8 rounded-2xl',
            'bg-[#111111]/90 backdrop-blur-sm border border-white/8'
          )}
        >
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-zinc-500" />
          </div>
          <p className="text-xl font-semibold text-zinc-300 mb-2">No scenes found</p>
          <p className="text-sm text-zinc-500 mb-6">Add scenes manually or generate them in Project Setup.</p>
          <div className="flex items-center justify-center gap-3">
            <AddSceneButton onClick={addScene} />
            <span className="text-sm font-medium text-white/80">Add First Scene</span>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence initial={false}>
          {scenes.map((scene, index) => (
            <motion.div
              key={scene.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              onClick={() => handleSelectScene(scene)}
              className={`${selectedScene?.id === scene.id ? 'border-l-2 border-[#f97316] pl-2 md:pl-4 -ml-2 md:-ml-4 mb-8 md:mb-12' : 'mb-8 md:mb-12'}`}
            >
              <ShotsRow
                sceneId={scene.id}
                sceneNumber={scene.scene_number}
                projectId={projectId}
                onSceneDelete={handleDeleteScene}
                isSelected={selectedScene?.id === scene.id}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      <div className="fixed bottom-6 right-4 md:bottom-8 md:right-8 z-30 pb-[env(safe-area-inset-bottom)]">
        <motion.button
          onClick={addScene}
          className={cn(
            'relative w-14 h-14 md:w-16 md:h-16 rounded-2xl',
            'bg-gradient-to-br from-[#151515] to-[#1b1b1b]',
            'border border-[#f97316]/25',
            'shadow-[0_0_24px_rgba(249,115,22,0.18),0_8px_24px_rgba(0,0,0,0.35)]',
            'flex items-center justify-center'
          )}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <Plus className="w-6 h-6 md:w-7 md:h-7 text-white drop-shadow-lg" />
        </motion.button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-[#090909] text-white">
      <AppHeader onOpenSettings={() => setIsSettingsPanelOpen(true)} />
      {isMobile ? (
        <div className="flex-grow overflow-hidden">{mainContent}</div>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="flex-grow">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="h-full">
            {sidebarNode}
          </ResizablePanel>
          <ResizablePanel defaultSize={80}>{mainContent}</ResizablePanel>
        </ResizablePanelGroup>
      )}
      
      {/* Enhanced Background */}
      {/* Base gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 -z-20" />
      
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div 
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-[#f97316]/8 blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-[#d4a574]/6 blur-3xl"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>
      
      {/* Noise texture */}
      <div className="fixed inset-0 bg-noise opacity-[0.02] -z-10 mix-blend-overlay" 
        style={{ backgroundImage: 'url(/noise.png)' }} 
      />

      {/* Settings Panel Overlay */}
      {isSettingsPanelOpen && projectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <SettingsPanel projectId={projectId} onClose={() => setIsSettingsPanelOpen(false)} />
        </div>
      )}

      <ConfirmGenerateDialog
        open={showProjectConfirmGenerate}
        onOpenChange={setShowProjectConfirmGenerate}
        onConfirm={() => {
          setShowProjectConfirmGenerate(false);
          startProjectAutoGenerate({ imageModelId: selectedImageModel, videoModelId: selectedVideoModel });
        }}
        title={projectNextPhase === 'images' ? 'Generate Missing Images' : 'Generate Missing Videos'}
        description={`This will process ${pendingProjectGenerationCount} incomplete shot(s) and skip completed outputs.`}
        estimatedCredits={
          projectNextPhase === 'images'
            ? getShotImageCredits(selectedImageModel) * pendingProjectGenerationCount
            : getShotVideoCredits(selectedVideoModel) * pendingProjectGenerationCount
        }
      />

      <ConfirmGenerateDialog
        open={showDirectorsCutConfirm}
        onOpenChange={setShowDirectorsCutConfirm}
        onConfirm={() => {
          setShowDirectorsCutConfirm(false);
          if (projectId) navigate(appRoutes.projects.directorsCut(projectId));
        }}
        title="Confirm Director's Cut"
        description="Are you sure you wish to proceed with Director's Cut?"
        estimatedCredits={DIRECTORS_CUT_CREDITS}
      />
    </div>
  );
};

export default StoryboardPage;
