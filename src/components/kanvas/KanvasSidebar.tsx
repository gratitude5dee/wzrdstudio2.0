import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clapperboard,
  Globe2,
  Home,
  Image as ImageIcon,
  Mic2,
  Music2,
  Pencil,
  Sparkles,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import type { KanvasStudio } from '@/features/kanvas/types';
import { KANVAS_STUDIO_ORDER, KANVAS_STUDIO_META } from '@/features/kanvas/helpers';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ShineBorder } from '@/components/ui/shine-border';

const STUDIO_ICONS: Record<KanvasStudio, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  edit: Pencil,
  cinema: Clapperboard,
  lipsync: Mic2,
  worldview: Globe2,
  'character-creation': Sparkles,
};

interface KanvasSidebarProps {
  activeStudio: KanvasStudio;
  onStudioChange: (studio: KanvasStudio) => void;
}

export function KanvasSidebar({ activeStudio, onStudioChange }: KanvasSidebarProps) {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setIsVisible(e.clientX <= 80);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Invisible hover trigger zone — desktop only */}
      <div className="hidden md:block fixed left-0 top-[68px] bottom-0 w-[80px] z-[49]" />

      <aside
        className={cn(
          'hidden md:flex fixed left-3 top-[calc(50%+34px)] -translate-y-1/2 z-50 flex-col items-center py-3 rounded-2xl',
          'bg-[#0A0A0A]/90 backdrop-blur-xl border border-white/[0.06]',
          'shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]',
          'transition-all duration-300 ease-out',
          isVisible
            ? 'w-14 opacity-100 translate-x-0'
            : 'w-3 opacity-0 -translate-x-2 pointer-events-none overflow-hidden',
        )}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {/* Lime glow border */}
        <ShineBorder
          shineColor={['#f97316', '#86efac', '#f97316']}
          borderWidth={1}
          duration={8}
        />

        {/* Faint lime gradient top-highlight */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[#f97316]/[0.04] via-transparent to-transparent pointer-events-none" />

        {/* Home button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate(appRoutes.home)}
              aria-label="Home"
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <Home className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="z-[60]">Home</TooltipContent>
        </Tooltip>

        {/* Divider */}
        <div className="mx-auto my-3 h-px w-6 bg-white/[0.06]" />

        {/* Studio icons */}
        <nav className="flex flex-1 flex-col items-center gap-1">
          {KANVAS_STUDIO_ORDER.map((studio) => {
            const Icon = STUDIO_ICONS[studio];
            const label = KANVAS_STUDIO_META[studio].label;
            const isActive = activeStudio === studio;

            return (
              <Tooltip key={studio}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onStudioChange(studio)}
                    aria-label={label}
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
                <TooltipContent side="right" sideOffset={8} className="z-[60]">{label}</TooltipContent>
              </Tooltip>
            );
          })}

          {/* Lyrics shortcut — separate route */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => navigate(appRoutes.kanvasLyrics)}
                aria-label="Lyrics"
                className="relative flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
              >
                <Music2 className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="z-[60]">Lyrics</TooltipContent>
          </Tooltip>
        </nav>

        {/* Bottom WZRD mark + brand dot */}
        <div className="mt-auto pt-3 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center">
            <img src="/lovable-uploads/wzrdtechlogo.png" alt="WZRD" className="h-10 w-10 object-contain" />
          </div>
          <div className="h-1.5 w-1.5 rounded-full bg-[#f97316] shadow-[0_0_6px_rgba(249,115,22,0.5)]" />
        </div>
      </aside>
    </TooltipProvider>
  );
}
