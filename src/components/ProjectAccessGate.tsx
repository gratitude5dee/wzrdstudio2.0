import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { appRoutes, buildLoginPath } from '@/lib/routes';

export type ProjectAccessStatus = 'loading' | 'allowed' | 'denied' | 'unauthenticated';

interface ProjectAccessGateProps {
  projectId?: string | null;
  children: ReactNode;
}

interface ProjectAccessState {
  status: ProjectAccessStatus;
  message?: string;
}

const bypassAuthForTests = import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true';

export function ProjectAccessGate({ projectId, children }: ProjectAccessGateProps) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const [state, setState] = useState<ProjectAccessState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      if (loading) {
        setState({ status: 'loading' });
        return;
      }

      if (!isAuthenticated) {
        setState({ status: 'unauthenticated' });
        return;
      }

      if (!projectId) {
        setState({ status: 'denied', message: 'No project ID specified.' });
        return;
      }

      if (bypassAuthForTests) {
        setActiveProject(projectId, 'Test Project');
        setState({ status: 'allowed' });
        return;
      }

      setState({ status: 'loading' });
      const { data, error } = await supabase
        .from('projects')
        .select('id, title')
        .eq('id', projectId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setState({
          status: 'denied',
          message: 'Project not found or you do not have access.',
        });
        return;
      }

      setActiveProject(data.id, data.title || 'Untitled');
      setState({ status: 'allowed' });
    }

    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loading, projectId, setActiveProject]);

  if (state.status === 'unauthenticated') {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={buildLoginPath(next)} replace state={{ from: location }} />;
  }

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0D16] text-white">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin text-orange-300" />
          Checking project access...
        </div>
      </div>
    );
  }

  if (state.status === 'denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0D16] px-6 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold">Project unavailable</h1>
          <p className="mt-2 text-sm text-zinc-400">{state.message}</p>
          <Link
            to={appRoutes.home}
            className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
          >
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProjectAccessGate;
