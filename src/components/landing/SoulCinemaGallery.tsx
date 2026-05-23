import { ChevronLeft, ChevronRight } from 'lucide-react';

const images = [
  'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&q=80',
  'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&q=80',
  'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&q=80',
  'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&q=80',
  'https://images.unsplash.com/photo-1524712245354-2c4e5e7121c0?w=600&q=80',
  'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600&q=80',
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80',
  'https://images.unsplash.com/photo-1460881680858-30d872d5b530?w=600&q=80',
];

const SoulCinemaGallery = () => {
  return (
    <section className="mx-6 py-20">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h3
            className="text-3xl font-black tracking-tighter text-white mb-1"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            WZRD.STUDIO SOUL CINEMA
          </h3>
          <p className="text-xs text-white/40">AI-generated cinematic stills from the community</p>
        </div>
        <div className="flex gap-2">
          <button className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {images.map((src, i) => (
          <div
            key={i}
            className={`rounded-2xl overflow-hidden bg-[#262626] ${
              i % 3 === 0 ? 'row-span-2' : ''
            }`}
          >
            <img
              src={src}
              alt={`Cinema still ${i + 1}`}
              className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-500 cursor-pointer"
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export default SoulCinemaGallery;
