import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type VoiceTargetType = 'character' | 'location' | 'scene' | 'shot';

export interface VoiceSelectedTarget {
  type: VoiceTargetType;
  id: string;
  label?: string;
  projectId?: string | null;
  sceneId?: string | null;
  sceneNumber?: number | null;
  shotNumber?: number | null;
  sourceImageUrl?: string | null;
}

interface VoiceSelectionContextValue {
  selectedTargets: Partial<Record<VoiceTargetType, VoiceSelectedTarget>>;
  expandedShotId: string | null;
  selectTarget: (target: VoiceSelectedTarget) => void;
  clearTarget: (type?: VoiceTargetType) => void;
  isSelected: (type: VoiceTargetType, id?: string | null) => boolean;
  setExpandedShotId: (shotId: string | null) => void;
}

const VoiceSelectionContext = createContext<VoiceSelectionContextValue | null>(null);

export function VoiceSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedTargets, setSelectedTargets] = useState<Partial<Record<VoiceTargetType, VoiceSelectedTarget>>>({});
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);

  const selectTarget = useCallback((target: VoiceSelectedTarget) => {
    setSelectedTargets((current) => ({
      ...current,
      [target.type]: target,
      ...(target.type === 'shot' && target.sceneId
        ? {
            scene: {
              type: 'scene' as const,
              id: target.sceneId,
              projectId: target.projectId,
              sceneNumber: target.sceneNumber,
            },
          }
        : {}),
    }));
  }, []);

  const clearTarget = useCallback((type?: VoiceTargetType) => {
    if (!type) {
      setSelectedTargets({});
      setExpandedShotId(null);
      return;
    }
    setSelectedTargets((current) => {
      const next = { ...current };
      delete next[type];
      return next;
    });
    if (type === 'shot') {
      setExpandedShotId(null);
    }
  }, []);

  const isSelected = useCallback(
    (type: VoiceTargetType, id?: string | null) => Boolean(id && selectedTargets[type]?.id === id),
    [selectedTargets],
  );

  const value = useMemo<VoiceSelectionContextValue>(
    () => ({
      selectedTargets,
      expandedShotId,
      selectTarget,
      clearTarget,
      isSelected,
      setExpandedShotId,
    }),
    [clearTarget, expandedShotId, isSelected, selectTarget, selectedTargets],
  );

  return <VoiceSelectionContext.Provider value={value}>{children}</VoiceSelectionContext.Provider>;
}

export function useVoiceSelection(): VoiceSelectionContextValue {
  const context = useContext(VoiceSelectionContext);
  if (!context) {
    throw new Error('useVoiceSelection must be used within VoiceSelectionProvider');
  }
  return context;
}

export function scrollVoiceTargetIntoView(selector: string) {
  window.requestAnimationFrame(() => {
    document.querySelector(selector)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  });
}
