import { Home, FolderKanban, Users, Settings, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onCreateProject: () => void;
}

export const MobileBottomNav = ({ activeView, onViewChange, onCreateProject }: MobileBottomNavProps) => {
  const navigate = useNavigate();

  const navItems = [
    { id: 'all', label: 'Projects', icon: FolderKanban },
    { id: 'kanvas', label: 'Kanvas', icon: Home, isRoute: true },
    { id: 'create', label: 'Create', icon: Plus, isAction: true },
    { id: 'shared', label: 'Shared', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleItemClick = (item: typeof navItems[0]) => {
    if (item.isAction) {
      onCreateProject();
    } else if (item.isRoute) {
      navigate('/kanvas');
    } else {
      onViewChange(item.id);
    }
  };

  return (
    <nav className={cn(
      "fixed bottom-0 left-0 right-0 z-50 md:hidden",
      "bg-card/98 backdrop-blur-2xl border-t border-border/50",
      "safe-area-inset-bottom"
    )}>
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const isCreateButton = item.isAction;

          if (isCreateButton) {
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={cn(
                  "flex flex-col items-center justify-center -mt-6",
                  "w-14 h-14 rounded-full",
                  "bg-gradient-to-br from-[hsl(25,95%,53%)] to-[hsl(20,90%,45%)]",
                  "shadow-[0_4px_20px_hsl(25,95%,53%,0.4)]",
                  "ring-4 ring-[hsl(25,95%,53%,0.2)]",
                  "active:scale-95 transition-transform"
                )}
              >
                <Icon className="w-6 h-6 text-primary-foreground" />
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg",
                "transition-all duration-200 min-w-[64px] min-h-[44px]",
                "active:scale-[0.92]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <Icon className={cn(
                "w-5 h-5 transition-transform",
                isActive && "scale-110"
              )} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && (
                <div className="absolute bottom-1.5 w-4 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
