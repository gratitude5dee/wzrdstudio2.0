import { Plus } from 'lucide-react';
import { musicPolishAssets } from '@/lib/musicPolishAssets';

interface NewProjectCardProps {
  onClick: () => void;
}

export const NewProjectCard = ({ onClick }: NewProjectCardProps) => {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full aspect-[4/3] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-white/[0.12] bg-[#1A1A1A] transition-all duration-200 hover:border-[#f97316]/40 hover:bg-white/[0.02]"
    >
      <img
        src={musicPolishAssets.cinema.soundstage.src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-35 transition duration-700 group-hover:scale-105 group-hover:opacity-45"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/55 to-black/25" />
      <div className="relative w-14 h-14 rounded-xl bg-[#f97316]/15 border border-[#f97316]/25 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
        <Plus className="w-7 h-7 text-white" />
      </div>
      <div className="relative text-center">
        <p className="text-base font-medium text-white mb-1">New Project</p>
        <p className="text-sm text-white/40">Start creating</p>
      </div>
    </button>
  );
};
