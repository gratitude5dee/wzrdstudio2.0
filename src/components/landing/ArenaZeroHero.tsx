import { Play } from 'lucide-react';

const ArenaZeroHero = () => {
  return (
    <section className="mx-6 mt-12 rounded-[2rem] h-[500px] relative overflow-hidden bg-[#131313]">
      {/* Background */}
      <img
        src="https://images.unsplash.com/photo-1518391846015-55a9cc003b25?w=1600&q=80"
        alt="Arena Zero"
        className="absolute inset-0 w-full h-full object-cover opacity-60"
        loading="lazy"
        decoding="async"
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

      {/* Content */}
      <div className="relative z-10 h-full flex items-end justify-between px-10 pb-10">
        {/* Left */}
        <div className="max-w-lg">
          <p className="text-[10px] font-bold tracking-[0.3em] text-white/60 uppercase mb-3">
            Watch it first &bull; World's first AI series
          </p>
          <h2
            className="text-7xl md:text-8xl font-black leading-[0.9] tracking-tighter text-white mb-6"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            EARTONE
          </h2>
          <button className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-white border border-white/10 px-6 py-3 rounded-full text-sm font-semibold hover:bg-white/20 transition-colors">
            <Play className="w-4 h-4 fill-white" />
            Watch now
          </button>
        </div>

        {/* Right */}
        <div className="hidden md:block max-w-xs text-right">
          <p className="text-[10px] font-bold tracking-[0.25em] text-white/80 uppercase mb-2">
            Available on WZRD.Studio
          </p>
          <p className="text-[10px] font-bold tracking-[0.25em] text-white/80 uppercase mb-4">
            Original Series
          </p>
          <p className="text-xs text-white/40 leading-relaxed">
            Experience the world's first AI-generated cinematic series. A new era of storytelling powered by generative media.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ArenaZeroHero;
