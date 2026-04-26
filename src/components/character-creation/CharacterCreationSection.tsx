import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { listBlueprints } from '@/services/characterBlueprintService';
import { CharacterGallery } from './CharacterGallery';
import { CharacterBuilder } from './CharacterBuilder';
import { CharacterDetail } from './CharacterDetail';

// ---------------------------------------------------------------------------
// CharacterCreationSection — Top-level component for the Kanvas studio tab
// ---------------------------------------------------------------------------

const sectionFade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

export function CharacterCreationSection() {
  const { mode, setBlueprints, setLoading } = useCharacterCreationStore();

  // Hydrate blueprints from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listBlueprints();
        if (!cancelled) {
          setBlueprints(data);
        }
      } catch {
        // Silently fail — gallery will show empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setBlueprints, setLoading]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 md:px-0 pb-16 md:pb-0">
      <AnimatePresence mode="wait">
        {mode === 'gallery' && (
          <motion.div key="gallery" {...sectionFade}>
            <CharacterGallery />
          </motion.div>
        )}
        {mode === 'builder' && (
          <motion.div key="builder" {...sectionFade}>
            <CharacterBuilder />
          </motion.div>
        )}
        {mode === 'detail' && (
          <motion.div key="detail" {...sectionFade}>
            <CharacterDetail />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
