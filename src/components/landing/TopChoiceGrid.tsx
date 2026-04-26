import { ArrowRight } from 'lucide-react';

const items = [
  { title: 'Nano Banana Pro', sub: 'Ultra-fast image gen', img: 'https://images.unsplash.com/photo-1614851099511-773084f6911d?w=300&q=80' },
  { title: 'Motion Control', sub: 'Camera path AI', img: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=300&q=80' },
  { title: 'Skin Enhancer', sub: 'Portrait retouching', img: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=300&q=80' },
  { title: 'Shots', sub: 'Scene composition', img: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&q=80' },
  { title: 'Angles 2.0', sub: 'Multi-angle gen', img: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=300&q=80' },
  { title: 'Kling 3.0', sub: 'Video synthesis', img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=300&q=80' },
  { title: 'Seedream 5.0 Lite', sub: 'Dream stylization', img: 'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=300&q=80' },
  { title: 'Soul Cast', sub: 'Character transfer', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80' },
];

const TopChoiceGrid = () => {
  return (
    <section className="mx-6 py-20">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h3
            className="text-3xl font-black tracking-tighter text-white mb-1"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            TOP CHOICE
          </h3>
          <p className="text-xs text-white/40">Most popular tools this week</p>
        </div>
        <button className="inline-flex items-center gap-1.5 bg-white/5 backdrop-blur-md border border-white/10 text-white/70 text-[11px] font-bold tracking-wider uppercase px-4 py-2 rounded-full hover:bg-white/10 transition-colors">
          See all
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        {items.map((item) => (
          <div key={item.title} className="group cursor-pointer">
            <div className="aspect-square rounded-2xl overflow-hidden mb-2 bg-[#262626]">
              <img
                src={item.img}
                alt={item.title}
                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
                loading="lazy"
                decoding="async"
              />
            </div>
            <p className="text-[10px] font-bold text-white/80 truncate">{item.title}</p>
            <p className="text-[9px] text-white/40 truncate">{item.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TopChoiceGrid;
