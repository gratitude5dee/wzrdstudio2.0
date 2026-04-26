import { Users, Globe, Star, ChevronLeft, LogOut, Layers, Sparkles, FolderKanban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import CreditsDisplay from '../CreditsDisplay';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TextAnimate } from '@/components/ui/text-animate';
import { ShineBorder } from '@/components/ui/shine-border';
import { useSidebar } from '@/contexts/SidebarContext';
import { appRoutes } from '@/lib/routes';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export const Sidebar = ({ activeView, onViewChange }: SidebarProps) => {
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const navigate = useNavigate();
  const [isFloatingVisible, setIsFloatingVisible] = useState(false);

  // Hover-reveal for collapsed (floating) mode
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isCollapsed) {
      setIsFloatingVisible(e.clientX <= 80);
    }
  }, [isCollapsed]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Reset floating visibility when expanding
  useEffect(() => {
    if (!isCollapsed) setIsFloatingVisible(false);
  }, [isCollapsed]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to log out');
    } else {
      toast.success('Logged out successfully');
      navigate('/');
    }
  };

  const mainNavItems = [
    { id: 'all', label: 'All Projects', icon: FolderKanban },
    { id: 'kanvas', label: 'Kanvas', icon: Layers, isRoute: true, showBadge: true },
    { id: 'aura', label: 'Aura (Observability)', icon: Sparkles },
  ];

  const secondaryNavItems = [
    { id: 'shared', label: 'Shared with me', icon: Users },
    { id: 'community', label: 'Community', icon: Globe },
  ];

  const sidebarVariants = {
    expanded: { width: 256 },
    collapsed: { width: 64 }
  };

  const textVariants = {
    visible: { opacity: 1, x: 0, display: "block" },
    hidden: { opacity: 0, x: -10, transitionEnd: { display: "none" } }
  };

  const NavItem = ({ item, index }: { item: typeof mainNavItems[0]; index: number }) => {
    const Icon = item.icon;
    const isActive = activeView === item.id;

    const content = (
      <motion.button
        key={item.id}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        whileHover={{ x: isCollapsed ? 0 : 2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (item.isRoute) {
            navigate(appRoutes.kanvas);
          } else {
            onViewChange(item.id);
          }
        }}
        className={cn(
          "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          isCollapsed && "justify-center px-2",
          isActive
            ? "bg-[rgba(249,115,22,0.12)] text-[#f97316] border border-[rgba(249,115,22,0.2)] shadow-sm"
            : "text-text-secondary hover:text-text-primary hover:bg-[rgba(249,115,22,0.06)] dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-white/[0.04]"
        )}
      >
        {isActive && (
          <ShineBorder
            shineColor="#f97316"
            borderWidth={1}
            duration={10}
          />
        )}
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 flex-shrink-0",
          isActive 
            ? "bg-[rgba(249,115,22,0.15)] shadow-sm" 
            : "bg-surface-2 dark:bg-white/[0.04]"
        )}>
          <Icon className={cn("w-4 h-4", isActive && "text-[#f97316]")} />
        </div>
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.span 
              variants={textVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.15 }}
              className="flex-1 text-left whitespace-nowrap"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
        {item.showBadge && !isCollapsed && (
          <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5 font-semibold">
            New
          </Badge>
        )}
      </motion.button>
    );

    if (isCollapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            <span className="flex items-center gap-2">
              {item.label}
              {item.showBadge && (
                <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5">
                  New
                </Badge>
              )}
            </span>
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  const SecondaryNavItem = ({ item }: { item: typeof secondaryNavItems[0] }) => {
    const Icon = item.icon;
    const isActive = activeView === item.id;

    const content = (
      <button
        onClick={() => onViewChange(item.id)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
          isCollapsed && "justify-center px-2",
          isActive
            ? "bg-[rgba(249,115,22,0.12)] text-[#f97316] border border-[rgba(249,115,22,0.2)]"
            : "text-text-secondary hover:text-text-primary hover:bg-[rgba(249,115,22,0.06)] dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-white/[0.04]"
        )}
      >
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
          isActive ? "bg-[rgba(249,115,22,0.15)]" : "bg-surface-2 dark:bg-white/[0.04]"
        )}>
          <Icon className={cn("w-4 h-4", isActive && "text-[#f97316]")} />
        </div>
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.span 
              variants={textVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.15 }}
              className="whitespace-nowrap"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );

    if (isCollapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  // ── Floating pill (collapsed mode) ──
  if (isCollapsed) {
    const allItems = [
      ...mainNavItems.map(i => ({ ...i, group: 'main' as const })),
      { id: '_divider1', label: '', icon: null, group: 'divider' as const },
      ...secondaryNavItems.map(i => ({ ...i, group: 'secondary' as const })),
      { id: '_divider2', label: '', icon: null, group: 'divider' as const },
      { id: '_favorites', label: 'Favorites', icon: Star, group: 'extra' as const },
    ];

    return (
      <TooltipProvider delayDuration={200}>
        {/* Invisible hover trigger zone */}
        <div className="fixed left-0 top-[68px] bottom-0 w-[80px] z-[49]" />

        <aside
          className={cn(
            'fixed left-3 top-[calc(50%+34px)] -translate-y-1/2 z-50 flex flex-col items-center py-3 rounded-2xl',
            'bg-[#0A0A0A]/90 backdrop-blur-xl',
            'shadow-[0_0_15px_rgba(249,115,22,0.15),0_0_30px_rgba(249,115,22,0.05),0_8px_32px_rgba(0,0,0,0.5)]',
            'transition-all duration-300 ease-out',
            isFloatingVisible ? 'w-14 opacity-100 translate-x-0' : 'w-3 opacity-0 -translate-x-2 pointer-events-none overflow-hidden',
          )}
          onMouseEnter={() => setIsFloatingVisible(true)}
          onMouseLeave={() => setIsFloatingVisible(false)}
        >
          {/* Animated orange glow border */}
          <ShineBorder
            shineColor={["#f97316", "#d4a574"]}
            borderWidth={1}
            duration={8}
          />

          {/* Faint orange top-highlight */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none" />
          {/* Expand button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                aria-label="Expand sidebar"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
              >
                <ChevronLeft className="h-[18px] w-[18px] rotate-180" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="z-[60]">Expand sidebar</TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="mx-auto my-2 h-px w-6 bg-white/[0.06]" />

          {/* Nav items */}
          <nav className="flex flex-1 flex-col items-center gap-1">
            {allItems.map((item) => {
              if (item.group === 'divider') {
                return <div key={item.id} className="mx-auto my-2 h-px w-6 bg-white/[0.06]" />;
              }
              const Icon = item.icon!;
              const isActive = activeView === item.id;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if ('isRoute' in item && item.isRoute) {
                          navigate(appRoutes.kanvas);
                        } else if (item.id === '_favorites') {
                          setFavoritesOpen(!favoritesOpen);
                        } else {
                          onViewChange(item.id);
                        }
                      }}
                      aria-label={item.label}
                      className={cn(
                        'relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200',
                        isActive
                          ? 'bg-white/10 text-[#f97316]'
                          : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-[#f97316] shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
                      )}
                      <Icon className="h-[18px] w-[18px]" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="z-[60]">
                    <span className="flex items-center gap-2">
                      {item.label}
                      {'showBadge' in item && item.showBadge && (
                        <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5">
                          New
                        </Badge>
                      )}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="mx-auto my-2 h-px w-6 bg-white/[0.06]" />

          {/* Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Logout"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-rose-500/10 hover:text-rose-400"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="z-[60]">Logout</TooltipContent>
          </Tooltip>

          {/* Brand dot */}
          <div className="mt-1 flex h-6 w-6 items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-[#f97316]/60 shadow-[0_0_6px_rgba(249,115,22,0.3)]" />
          </div>
        </aside>
      </TooltipProvider>
    );
  }

  // ── Expanded mode (unchanged) ──
  return (
    <TooltipProvider>
      <motion.aside
        variants={sidebarVariants}
        animate="expanded"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "h-screen flex flex-col fixed left-0 top-0 z-50 border-r group/sidebar",
          "bg-surface-1 border-border-default",
          "dark:glass-sidebar dark:border-white/[0.04]"
        )}
      >
        {/* Persistent animated orange glow border */}
        <div className="absolute inset-0 opacity-60 group-hover/sidebar:opacity-100 transition-opacity duration-500 pointer-events-none rounded-r-xl overflow-hidden">
          <ShineBorder
            shineColor={["#f97316", "#d4a574"]}
            borderWidth={1}
            duration={8}
          />
        </div>

        {/* Collapse Toggle Button */}
        <motion.button
          onClick={() => setIsCollapsed(true)}
          className="absolute -right-3 top-6 z-50 h-6 w-6 rounded-full bg-surface-1 dark:bg-zinc-800 border border-border-default dark:border-zinc-700 shadow-md flex items-center justify-center hover:bg-surface-2 dark:hover:bg-zinc-700 transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.button>

        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-amber-400/5 pointer-events-none dark:from-[rgba(255,107,74,0.04)] dark:to-[rgba(245,158,11,0.02)]" />
        
        {/* Top highlight line */}
        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        
        {/* Workspace Switcher */}
        <div className="relative z-10 border-b border-border-default dark:border-white/[0.05] p-4">
          <WorkspaceSwitcher isCollapsed={false} />
        </div>

        {/* Main Navigation */}
        <nav data-tour="sidebar-nav" className="relative z-10 flex-1 space-y-6 overflow-y-auto p-4">
          {/* Main Menu Section */}
          <div>
            <div className="flex items-center gap-2 px-3 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#f97316]" />
              <TextAnimate animation="fadeIn" by="character" delay={0.1} className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.15em]">
                Main Menu
              </TextAnimate>
            </div>
            <div className="space-y-1">
              {mainNavItems.map((item, index) => (
                <NavItem key={item.id} item={item} index={index} />
              ))}
            </div>
          </div>

          {/* Secondary Navigation */}
          <div>
            <div className="flex items-center gap-2 px-3 mb-3">
              <Users className="w-3.5 h-3.5 text-text-tertiary" />
              <TextAnimate animation="fadeIn" by="character" delay={0.2} className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.15em]">
                Collaborate
              </TextAnimate>
            </div>
            <div className="space-y-1">
              {secondaryNavItems.map((item) => (
                <SecondaryNavItem key={item.id} item={item} />
              ))}
            </div>
          </div>

          {/* Favorites Section */}
          <div>
            <button
              onClick={() => setFavoritesOpen(!favoritesOpen)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors dark:text-muted-foreground dark:hover:text-foreground"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center dark:bg-amber/10 flex-shrink-0">
                <Star className="w-4 h-4 text-amber-500" />
              </div>
              <span className="flex-1 text-left font-medium whitespace-nowrap">Favorites</span>
              <ChevronLeft className={cn(
                "w-4 h-4 transition-transform duration-200",
                favoritesOpen ? "-rotate-90" : "rotate-0"
              )} />
            </button>
            
            <AnimatePresence>
              {favoritesOpen && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 ml-6 pl-3 border-l border-border-default space-y-1 dark:border-white/[0.06] overflow-hidden"
                >
                  <p className="text-xs text-text-tertiary py-2 italic dark:text-muted-foreground/50">No favorites yet</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        {/* Bottom Section */}
        <div className="relative z-10 border-t border-border-default space-y-4 dark:border-white/[0.05] p-4">
          {/* Credits Display */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/10 to-amber-200/30 border border-orange-500/15 backdrop-blur-sm dark:from-[rgba(255,107,74,0.1)] dark:to-[rgba(245,158,11,0.05)] dark:border-[rgba(255,107,74,0.2)]">
            <CreditsDisplay showTooltip={false} />
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center justify-center">
            <button 
              onClick={handleLogout}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                "text-text-secondary hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/20",
                "border border-transparent",
                "dark:text-muted-foreground dark:hover:text-rose-400"
              )}
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
              <span className="whitespace-nowrap">Logout</span>
            </button>
          </div>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
};
