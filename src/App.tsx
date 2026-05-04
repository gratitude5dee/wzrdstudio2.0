
import { Suspense, lazy, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { ThirdwebProvider } from "thirdweb/react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/providers/AuthProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import ProjectAccessGate from "@/components/ProjectAccessGate";
import PerfShell from "@/components/perf/PerfShell";
import { StudioErrorBoundary } from "@/components/studio/StudioErrorBoundary";
import CustomCursor from "@/components/CustomCursor";
import { CursorLoadingProvider, useCursorLoading } from "@/contexts/CursorLoadingContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { appRoutes } from "@/lib/routes";
import { InsufficientCreditsDialog } from "@/components/billing/InsufficientCreditsDialog";
import { VoiceAgentProvider } from "@/voice/VoiceAgentProvider";

// Retry a dynamic import once; if it still fails (typically a stale chunk hash
// after a redeploy/HMR), force a single hard reload so the browser fetches the
// new asset manifest. Prevents persistent blank screens.
const RELOAD_FLAG = "__lov_chunk_reloaded__";
const lazyWithRetry = <T extends { default: React.ComponentType<Record<string, never>> }>(
  importer: () => Promise<T>,
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isChunkError =
        /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
      if (isChunkError && typeof window !== "undefined") {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          window.location.reload();
          return new Promise<T>(() => {});
        }
        sessionStorage.removeItem(RELOAD_FLAG);
      }
      throw err;
    }
  });

const Landing = lazyWithRetry(() => import("./pages/Landing"));
const Login = lazyWithRetry(() => import("./pages/Login"));
const Home = lazyWithRetry(() => import("./pages/Home"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const SettingsBillingPage = lazyWithRetry(() => import("./pages/SettingsBillingPage"));
const SettingsBillingDocsPage = lazyWithRetry(() => import("./pages/SettingsBillingDocsPage"));
const ProjectSetup = lazyWithRetry(() => import("./pages/ProjectSetup"));
const StudioPage = lazyWithRetry(() => import("./pages/StudioPage"));
const LearningStudioPage = lazyWithRetry(() => import("./pages/LearningStudioPage"));
const StoryboardPage = lazyWithRetry(() => import("./pages/StoryboardPage"));
const ProjectObservabilityPage = lazyWithRetry(() => import("./pages/ProjectObservabilityPage"));
const DirectorCutPage = lazyWithRetry(() => import("./pages/DirectorCutPage"));
const EditorPage = lazyWithRetry(() => import("./pages/EditorPage"));
const Storyboard = lazyWithRetry(() => import("./pages/Storyboard"));
const ShotEditor = lazyWithRetry(() => import("./pages/ShotEditor"));
const KanvasPage = lazyWithRetry(() => import("./pages/KanvasPage"));
const KanvasLyrics = lazyWithRetry(() => import("./pages/KanvasLyrics"));
const KanvasRemix = lazyWithRetry(() => import("./pages/KanvasRemix"));
const KanvasRemixJobs = lazyWithRetry(() => import("./pages/KanvasRemixJobs"));
const AssetsPage = lazyWithRetry(() => import("./pages/AssetsPage"));
const IPVault = lazyWithRetry(() => import("./pages/IPVault"));

const RedirectProjectTimelineAlias = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.timeline(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyStudioProject = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.studio(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const StudioRootRoute = () => {
  const location = useLocation();
  const isNodePopulationE2E =
    import.meta.env.DEV &&
    import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === "true" &&
    new URLSearchParams(location.search).get("e2e") === "node-population";

  return isNodePopulationE2E ? <StudioPage /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyTimelineProject = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.timeline(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyEditorProject = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.editor(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyDirectorsCut = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.directorsCut(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const ProtectedProjectRoute = ({ children }: { children: React.ReactNode }) => {
  const { projectId } = useParams();
  return <ProjectAccessGate projectId={projectId}>{children}</ProjectAccessGate>;
};

const CursorWrapper = () => {
  const { isLoading } = useCursorLoading();
  return <CustomCursor isLoading={isLoading} />;
};

const queryClient = new QueryClient();

const App = () => {
  const usePerfShell = (import.meta.env.VITE_USE_PERF_SHELL ?? 'true') !== 'false';
  const fallback = usePerfShell ? <PerfShell headline="Preparing studio" /> : null;
  const bypassAuthForTests =
    import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true';
  const [isLoading, setIsLoading] = useState(() => !bypassAuthForTests);

  useEffect(() => {
    if (bypassAuthForTests) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [bypassAuthForTests]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <ThirdwebProvider>
          <TooltipProvider>
            <BrowserRouter>
            <AuthProvider>
              <VoiceAgentProvider>
              <SidebarProvider>
              <CursorLoadingProvider>
                {!bypassAuthForTests ? (
                  <LoadingScreen isLoading={isLoading} message="Initializing WZRD Studio..." />
                ) : null}
                <CursorWrapper />
                <Toaster />
                <Sonner />
                <InsufficientCreditsDialog />
                <Suspense fallback={fallback}>
                  <Routes>
                    <Route path={appRoutes.landing} element={<Landing />} />
                    <Route path={appRoutes.login} element={<Login />} />
                    <Route
                      path={appRoutes.home}
                      element={
                        <ProtectedRoute>
                          <Home />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.projectSetup}
                      element={
                        <ProtectedRoute>
                          <ProjectSetup />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.legacy.studioRoot}
                      element={
                        <ProtectedRoute>
                          <StudioRootRoute />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/projects/:projectId/studio"
                      element={
                        <ProtectedRoute>
                          <ProtectedProjectRoute>
                            <StudioPage />
                          </ProtectedProjectRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.assets}
                      element={
                        <ProtectedRoute>
                          <AssetsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.ipVault}
                      element={
                        <ProtectedRoute>
                          <IPVault />
                        </ProtectedRoute>
                      }
                    />
                    <Route path={appRoutes.legacy.ipVault} element={<Navigate to={appRoutes.ipVault} replace />} />
                    <Route
                      path={appRoutes.learningStudio}
                      element={
                        <ProtectedRoute>
                          <LearningStudioPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/projects/:projectId/timeline"
                      element={
                        <ProtectedRoute>
                          <ProtectedProjectRoute>
                            <StoryboardPage />
                          </ProtectedProjectRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/projects/:projectId/observability"
                      element={
                        <ProtectedRoute>
                          <ProtectedProjectRoute>
                            <ProjectObservabilityPage />
                          </ProtectedProjectRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/projects/:projectId/directors-cut"
                      element={
                        <ProtectedRoute>
                          <ProtectedProjectRoute>
                            <DirectorCutPage />
                          </ProtectedProjectRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/projects/:projectId/editor"
                      element={
                        <ProtectedRoute>
                          <ProtectedProjectRoute>
                            <EditorPage />
                          </ProtectedProjectRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/studio/:projectId" element={<RedirectLegacyStudioProject />} />
                    <Route path="/timeline/:projectId" element={<RedirectLegacyTimelineProject />} />
                    <Route path="/timeline/:projectId/directors-cut" element={<RedirectLegacyDirectorsCut />} />
                    <Route path="/editor/:projectId" element={<RedirectLegacyEditorProject />} />
                    <Route path="/video-editor/:projectId" element={<RedirectLegacyEditorProject />} />
                    <Route path="/storyboard/:projectId" element={<RedirectProjectTimelineAlias />} />
                    <Route path="/project/:projectId/timeline" element={<RedirectProjectTimelineAlias />} />
                    <Route path={appRoutes.legacy.storyboardRoot} element={<Navigate to={appRoutes.home} replace />} />
                    <Route path={appRoutes.legacy.timelineRoot} element={<Navigate to={appRoutes.home} replace />} />
                    <Route path={appRoutes.legacy.editorRoot} element={<Navigate to={appRoutes.home} replace />} />
                    <Route
                      path="/credits"
                      element={
                        <ProtectedRoute>
                          <Navigate to={appRoutes.settings.billing} replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.settings.billing}
                      element={
                        <ProtectedRoute>
                          <SettingsBillingPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.settings.billingDocs}
                      element={
                        <ProtectedRoute>
                          <SettingsBillingDocsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.storyboardGenerator}
                      element={
                        <ProtectedRoute>
                          <Storyboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/shot-editor/:shotId"
                      element={
                        <ProtectedRoute>
                          <ShotEditor />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.kanvas}
                      element={
                        <ProtectedRoute>
                          <StudioErrorBoundary fallbackTitle="Kanvas encountered an error" fallbackDescription="The multi-studio canvas hit an unexpected issue">
                            <KanvasPage />
                          </StudioErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.kanvasLyrics}
                      element={
                        <ProtectedRoute>
                          <StudioErrorBoundary fallbackTitle="Lyrics wizard error" fallbackDescription="The Create Template wizard hit an unexpected issue">
                            <KanvasLyrics />
                          </StudioErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.kanvasLyricsNew}
                      element={
                        <ProtectedRoute>
                          <StudioErrorBoundary fallbackTitle="Lyrics wizard error" fallbackDescription="The Create Template wizard hit an unexpected issue">
                            <KanvasLyrics />
                          </StudioErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/kanvas/lyrics/templates/:templateId"
                      element={
                        <ProtectedRoute>
                          <StudioErrorBoundary fallbackTitle="Lyrics wizard error" fallbackDescription="The Create Template wizard hit an unexpected issue">
                            <KanvasLyrics />
                          </StudioErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/kanvas/remix/jobs/:jobId"
                      element={
                        <ProtectedRoute>
                          <StudioErrorBoundary fallbackTitle="Remix jobs error" fallbackDescription="The Remix job view hit an unexpected issue">
                            <KanvasRemixJobs />
                          </StudioErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path={appRoutes.kanvasRemix}
                      element={
                        <ProtectedRoute>
                          <StudioErrorBoundary fallbackTitle="Remix error" fallbackDescription="The Remix studio hit an unexpected issue">
                            <KanvasRemix />
                          </StudioErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/kanvas/remix/:templateId"
                      element={
                        <ProtectedRoute>
                          <StudioErrorBoundary fallbackTitle="Remix error" fallbackDescription="The Remix studio hit an unexpected issue">
                            <KanvasRemix />
                          </StudioErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </CursorLoadingProvider>
              </SidebarProvider>
              </VoiceAgentProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThirdwebProvider>
    </ThemeProvider>
  </QueryClientProvider>
  );
};

export default App;
