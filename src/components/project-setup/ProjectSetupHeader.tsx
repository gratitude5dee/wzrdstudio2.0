import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { useProjectContext } from './ProjectContext';

interface ProjectSetupHeaderProps {
  currentStep?: number;
  totalSteps?: number;
}

const ProjectSetupHeader = ({ currentStep = 1, totalSteps = 4 }: ProjectSetupHeaderProps) => {
  const navigate = useNavigate();
  const { projectId } = useProjectContext();
  
  const handleBack = () => {
    navigate(appRoutes.home);
  };
  
  return (
    <header className={cn(
      "w-full border-b px-6 py-4 shadow-lg",
      "bg-[#0a0a0f]/95 backdrop-blur-xl",
      "border-[rgba(249,115,22,0.1)]"
    )}>
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(249,115,22,0.2)] to-transparent" />
      
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4 cursor-pointer" onClick={handleBack}>
          <Logo size="sm" showVersion={false} />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium">Set up your project</span>
              <span className="text-lg">✨</span>
            </div>
            <span className="text-xs text-muted-foreground">Visualize your concept</span>
          </div>
        </div>
        
        {/* Progress Indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Step</span>
            <span className="text-sm font-semibold text-[#f97316]">{currentStep}</span>
            <span className="text-sm text-muted-foreground">of {totalSteps}</span>
          </div>
          <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#f97316] to-[#d4a574] rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {projectId ? (
            <Button
              variant="outline"
              className="border-[rgba(249,115,22,0.2)] bg-transparent text-[#f97316] hover:bg-[rgba(249,115,22,0.08)] hover:border-[rgba(249,115,22,0.3)]"
              onClick={() => navigate(appRoutes.projects.observability(projectId))}
            >
              Observability
            </Button>
          ) : null}
          <ThemeToggle />
          <Button variant="ghost" className="bg-transparent hover:bg-[rgba(249,115,22,0.08)] text-[#f97316]">
            Upgrade
          </Button>
          <div className="w-8 h-8 rounded-full bg-[#f97316] flex items-center justify-center text-white font-semibold">
            G
          </div>
        </div>
      </div>
    </header>
  );
};

export default ProjectSetupHeader;
