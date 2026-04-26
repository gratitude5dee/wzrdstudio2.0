import { ArrowRight } from 'lucide-react';

const cards = [
  { title: 'CREATE IMAGE', img: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&q=80' },
  { title: 'CREATE VIDEO', img: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&q=80' },
  { title: 'MOTION CONTROL', img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80' },
  { title: 'SOUL 2.0', img: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&q=80', isNew: true },
  { title: 'SOUL ID', img: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&q=80' },
];

const CreateTodaySection = () => {
  return (
    <section className="mx-6 py-24 flex flex-col lg:flex-row gap-12">
      {/* Left */}
      <div className="lg:w-[30%] flex flex-col justify-center">
        <h2
          className="text-5xl md:text-6xl font-black leading-[0.95] tracking-tighter mb-6"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          <span className="text-white">WHAT WILL YOU</span>
          <br />
          <span className="text-[#ccff00]">CREATE TODAY?</span>
        </h2>
        <p className="text-sm text-white/40 leading-relaxed mb-8 max-w-xs">
          From still images to full cinematic sequences — every creative tool you need, powered by the latest AI models.
        </p>
        <button className="inline-flex items-center gap-2 bg-[#ccff00] text-black rounded-full px-6 py-3 font-bold text-sm hover:shadow-[0_0_15px_rgba(204,255,0,0.4)] transition-shadow w-fit">
          Explore all tools
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right — scrollable cards */}
      <div className="lg:w-[70%] flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {cards.map((card) => (
          <div key={card.title} className="flex flex-col gap-3 min-w-[200px] w-[200px] group cursor-pointer flex-shrink-0">
            <div className="relative h-[240px] rounded-2xl overflow-hidden">
              <img
                src={card.img}
                alt={card.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                decoding="async"
              />
              {card.isNew && (
                <span className="absolute top-3 left-3 bg-[#ccff00]/90 text-black text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase">
                  New
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-widest text-white/80 uppercase">
                {card.title}
              </span>
              <ArrowRight className="w-3 h-3 text-white/30 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-white/60" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CreateTodaySection;
