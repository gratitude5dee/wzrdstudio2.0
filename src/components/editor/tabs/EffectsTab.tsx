import React, { useState, useCallback } from 'react';
import { Sliders, Check } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { musicPolishAssets } from '@/lib/musicPolishAssets';
import type { MusicPolishAsset } from '@/lib/musicPolishAssets';

interface Effect {
  id: string;
  name: string;
  type: 'filter' | 'adjustment' | 'overlay';
  params: Record<string, number>;
  preview: MusicPolishAsset;
  icon?: string;
}

interface EffectsTabProps {
  onSelectEffect: (effect: Effect) => void;
}

const effects: Effect[] = [
  { id: 'brightness', name: 'Brightness', type: 'adjustment', params: { value: 100 }, preview: musicPolishAssets.cinema.performanceCloseup },
  { id: 'contrast', name: 'Contrast', type: 'adjustment', params: { value: 100 }, preview: musicPolishAssets.landing.heroGothicStorm },
  { id: 'saturation', name: 'Saturation', type: 'adjustment', params: { value: 100 }, preview: musicPolishAssets.cinema.neonStreet },
  { id: 'exposure', name: 'Exposure', type: 'adjustment', params: { value: 0 }, preview: musicPolishAssets.cinema.soundstage },
  { id: 'blur', name: 'Blur', type: 'filter', params: { radius: 0 }, preview: musicPolishAssets.landing.animatedRainStreet },
  { id: 'sharpen', name: 'Sharpen', type: 'filter', params: { amount: 0 }, preview: musicPolishAssets.kanvas.stageProductVisual },
  { id: 'grayscale', name: 'Grayscale', type: 'filter', params: { amount: 0 }, preview: musicPolishAssets.lyrics.gothicStorm },
  { id: 'sepia', name: 'Sepia', type: 'filter', params: { amount: 0 }, preview: musicPolishAssets.lyrics.rnbGlass },
  { id: 'invert', name: 'Invert', type: 'filter', params: { amount: 0 }, preview: musicPolishAssets.landing.rooftopChoreography },
  { id: 'vignette', name: 'Vignette', type: 'overlay', params: { intensity: 0 }, preview: musicPolishAssets.talent.faceWardrobe },
  { id: 'grain', name: 'Film Grain', type: 'overlay', params: { amount: 0 }, preview: musicPolishAssets.toolSurfaces.editWorkbench },
  { id: 'noise', name: 'Noise', type: 'overlay', params: { amount: 0 }, preview: musicPolishAssets.landing.platformDeliveryWall },
];

const getParamConfig = (effectId: string, paramKey: string) => {
  const configs: Record<string, { min: number; max: number; step: number }> = {
    brightness: { min: 0, max: 200, step: 1 },
    contrast: { min: 0, max: 200, step: 1 },
    saturation: { min: 0, max: 200, step: 1 },
    exposure: { min: -100, max: 100, step: 1 },
    blur: { min: 0, max: 20, step: 0.5 },
    sharpen: { min: 0, max: 100, step: 1 },
    grayscale: { min: 0, max: 100, step: 1 },
    sepia: { min: 0, max: 100, step: 1 },
    invert: { min: 0, max: 100, step: 1 },
    vignette: { min: 0, max: 100, step: 1 },
    grain: { min: 0, max: 100, step: 1 },
    noise: { min: 0, max: 100, step: 1 },
  };
  return configs[effectId] || { min: 0, max: 100, step: 1 };
};

export const EffectsTab: React.FC<EffectsTabProps> = ({ onSelectEffect }) => {
  const [selectedEffect, setSelectedEffect] = useState<string | null>(null);
  const [effectParams, setEffectParams] = useState<Record<string, number>>({});

  const handleSelectEffect = useCallback((effect: Effect) => {
    setSelectedEffect(effect.id);
    setEffectParams(effect.params);
  }, []);

  const handleApply = useCallback(() => {
    const effect = effects.find((e) => e.id === selectedEffect);
    if (effect) {
      onSelectEffect({ ...effect, params: effectParams });
      setSelectedEffect(null);
      setEffectParams({});
    }
  }, [selectedEffect, effectParams, onSelectEffect]);

  const handleReset = useCallback(() => {
    const effect = effects.find((e) => e.id === selectedEffect);
    if (effect) {
      setEffectParams(effect.params);
    }
  }, [selectedEffect]);

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Effects Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {effects.map((effect) => (
          <div
            key={effect.id}
            onClick={() => handleSelectEffect(effect)}
            className={cn(
              'relative overflow-hidden bg-zinc-800 rounded-lg cursor-pointer transition-all',
              'hover:bg-zinc-700',
              selectedEffect === effect.id && 'ring-2 ring-orange-500 bg-zinc-700'
            )}
          >
            <div className="relative aspect-video">
              <img
                src={effect.preview.src}
                alt={effect.preview.alt}
                className="h-full w-full object-cover opacity-70"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <Sliders className="absolute left-2 top-2 w-4 h-4 text-white/70" />
            </div>
            <p className="px-2 py-2 text-[10px] text-zinc-300 truncate">{effect.name}</p>
          </div>
        ))}
      </div>

      {/* Effect Settings */}
      {selectedEffect && (
        <div className="flex-1 border-t border-zinc-800 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">
              {effects.find((e) => e.id === selectedEffect)?.name} Settings
            </p>
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs">
              Reset
            </Button>
          </div>

          {Object.entries(effectParams).map(([key, value]) => {
            const config = getParamConfig(selectedEffect, key);
            return (
              <div key={key}>
                <div className="flex justify-between text-xs text-zinc-400 mb-2">
                  <span className="capitalize">{key}</span>
                  <span>{typeof value === 'number' ? value.toFixed(config.step < 1 ? 1 : 0) : value}</span>
                </div>
                <Slider
                  value={[value]}
                  onValueChange={([v]) => setEffectParams((prev) => ({ ...prev, [key]: v }))}
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  className="w-full"
                />
              </div>
            );
          })}

          <Button onClick={handleApply} className="w-full mt-4">
            <Check className="w-4 h-4 mr-2" />
            Apply Effect
          </Button>
        </div>
      )}
    </div>
  );
};

EffectsTab.displayName = 'EffectsTab';
