import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVideoEditorStore } from '@/store/videoEditorStore';

export function useRealtimeTimelineSync(projectId?: string | null) {
  const loadProject = useVideoEditorStore((state) => state.loadProject);

  useEffect(() => {
    if (!projectId) return;

    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        loadProject(projectId).catch((error) => {
          console.error('Failed to sync remote timeline update', error);
        });
      }, 250);
    };

    const timelineChannel = supabase
      .channel(`project:${projectId}:timeline-document`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timelines', filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      timelineChannel.unsubscribe();
    };
  }, [loadProject, projectId]);
}
