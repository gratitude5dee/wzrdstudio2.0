import React from 'react';
import { motion } from 'framer-motion';
import { Film, Megaphone, Music, BookOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { musicPolishAssets } from '@/lib/musicPolishAssets';
import { ProjectFormat } from './types';

interface FormatOption {
  id: ProjectFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  image: string;
  imageAlt: string;
  badge: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'custom',
    label: 'Custom',
    description: 'Full creative freedom for any project type',
    icon: <Sparkles className="w-6 h-6" />,
    gradient: 'from-purple-500/20 to-indigo-500/20',
    image: musicPolishAssets.kanvas.aiVisualWall.src,
    imageAlt: musicPolishAssets.kanvas.aiVisualWall.alt,
    badge: 'Flexible',
  },
  {
    id: 'short_film',
    label: 'Short Film',
    description: 'Narrative-driven cinematic storytelling',
    icon: <Film className="w-6 h-6" />,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    image: musicPolishAssets.cinema.soundstage.src,
    imageAlt: musicPolishAssets.cinema.soundstage.alt,
    badge: 'Narrative',
  },
  {
    id: 'commercial',
    label: 'Commercial',
    description: 'Ad brief-driven marketing content',
    icon: <Megaphone className="w-6 h-6" />,
    gradient: 'from-orange-500/20 to-amber-500/20',
    image: musicPolishAssets.kanvas.stageProductVisual.src,
    imageAlt: musicPolishAssets.kanvas.stageProductVisual.alt,
    badge: 'Campaign',
  },
  {
    id: 'music_video',
    label: 'Music Video',
    description: 'Treatment, audio, lyrics, and performance scenes',
    icon: <Music className="w-6 h-6" />,
    gradient: 'from-pink-500/20 to-rose-500/20',
    image: musicPolishAssets.landing.rooftopChoreography.src,
    imageAlt: musicPolishAssets.landing.rooftopChoreography.alt,
    badge: 'Studio',
  },
  {
    id: 'infotainment',
    label: 'Infotainment',
    description: 'Educational + entertainment content',
    icon: <BookOpen className="w-6 h-6" />,
    gradient: 'from-amber-500/20 to-orange-500/20',
    image: musicPolishAssets.landing.animatedRainStreet.src,
    imageAlt: musicPolishAssets.landing.animatedRainStreet.alt,
    badge: 'Explain',
  },
];

interface FormatSelectorProps {
  selectedFormat: ProjectFormat;
  onFormatChange: (format: ProjectFormat) => void;
}

export const FormatSelector: React.FC<FormatSelectorProps> = ({
  selectedFormat,
  onFormatChange,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {FORMAT_OPTIONS.map((option) => {
        const isSelected = selectedFormat === option.id;

        return (
          <motion.button
            key={option.id}
            onClick={() => onFormatChange(option.id)}
            aria-pressed={isSelected}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'group relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-lg border p-4 text-left transition-all duration-300',
              'bg-gradient-to-br backdrop-blur-sm',
              option.gradient,
              isSelected
                ? 'border-primary/60 shadow-lg shadow-primary/20 ring-2 ring-primary/30'
                : 'border-white/10 hover:border-white/20'
            )}
          >
            <img
              src={option.image}
              alt={option.imageAlt}
              className="absolute inset-0 h-full w-full object-cover opacity-45 transition duration-700 group-hover:scale-[1.04]"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/20" />
            <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-300 backdrop-blur">
              {option.badge}
            </div>
            <div
              className={cn(
                'relative w-12 h-12 rounded-lg flex items-center justify-center mb-3 transition-colors',
                isSelected
                  ? 'bg-primary/20 text-primary'
                  : 'bg-white/5 text-zinc-400'
              )}
            >
              {option.icon}
            </div>

            <h3
              className={cn(
                'relative font-medium text-sm mb-1 transition-colors',
                isSelected ? 'text-white' : 'text-zinc-300'
              )}
            >
              {option.label}
            </h3>

            <p className="relative text-xs text-zinc-400 line-clamp-2">
              {option.description}
            </p>

            {isSelected && (
              <motion.div
                layoutId="format-indicator"
                className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                initial={false}
              >
                <svg
                  className="w-2.5 h-2.5 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
