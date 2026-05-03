import { useParams, Navigate } from 'react-router-dom';
import { VideoEditorProvider } from '@/providers/VideoEditorProvider';
import VideoEditor from '@/components/editor/VideoEditor';
import AppHeader from '@/components/AppHeader';
import { appRoutes } from '@/lib/routes';

const EditorPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();

  if (!projectId) {
    return <Navigate to={appRoutes.home} replace />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0D16]">
      <AppHeader />
      <div className="flex-1 bg-[#0F1117] overflow-hidden">
        <VideoEditorProvider>
          <VideoEditor />
        </VideoEditorProvider>
      </div>
    </div>
  );
};

export default EditorPage;
