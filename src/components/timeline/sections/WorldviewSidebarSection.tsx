import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe2, ChevronDown, Sparkles } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useWorldviewStore } from '@/lib/stores/worldview-store';
import { WorldviewSection } from '@/components/worldview/WorldviewSection';

interface WorldviewSidebarSectionProps {
  sceneId: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function WorldviewSidebarSection({
  sceneId,
  isOpen = false,
  onToggle,
}: WorldviewSidebarSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const worlds = useWorldviewStore((s) => s.worlds);
  const activeWorldId = useWorldviewStore((s) => s.activeWorldId);

  const activeWorld = worlds.find((w) => w.id === activeWorldId);
  const thumbnailUrl = activeWorld?.assets?.thumbnailUrl || activeWorld?.assets?.panoramaUrl;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={onToggle} className="space-y-2 pt-3 border-t border-[#f97316]/10">
        <CollapsibleTrigger asChild>
          <motion.div
            className={cn(
              "flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg",
              "hover:bg-zinc-800/30 transition-all duration-200",
              "border border-transparent hover:border-[#f97316]/20"
            )}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-zinc-800/50 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <Globe2 className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <span className="text-sm font-medium text-zinc-200">Worldview</span>
            </div>
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            </motion.div>
          </motion.div>
        </CollapsibleTrigger>

        <AnimatePresence initial={false}>
          {isOpen && (
            <CollapsibleContent forceMount>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="pl-5 pt-2 space-y-3"
              >
                {thumbnailUrl ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden border border-zinc-800/50">
                      <img
                        src={thumbnailUrl}
                        alt="Worldview preview"
                        className="w-full h-28 object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-zinc-300">
                        {activeWorld?.displayName || 'World'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-8 text-xs border-zinc-700 hover:border-orange-500/40 text-zinc-300"
                      onClick={() => setDialogOpen(true)}
                    >
                      <Globe2 className="w-3 h-3 mr-1" />
                      View World
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setDialogOpen(true)}
                    className="w-full h-9 text-xs bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30"
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Generate Worldview
                  </Button>
                )}
              </motion.div>
            </CollapsibleContent>
          )}
        </AnimatePresence>
      </Collapsible>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl h-[80vh] p-0 bg-zinc-950 border-zinc-800 overflow-hidden">
          <DialogTitle className="sr-only">Worldview Generator</DialogTitle>
          <div className="w-full h-full overflow-auto">
            <WorldviewSection />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
