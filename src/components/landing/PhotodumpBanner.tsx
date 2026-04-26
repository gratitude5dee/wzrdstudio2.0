const PhotodumpBanner = () => {
  return (
    <section className="mx-6 my-20 h-[320px] rounded-[2rem] relative overflow-hidden flex items-center px-12 bg-[#131313]">
      {/* Background */}
      <img
        src="https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1400&q=80"
        alt="Photodump background"
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />

      {/* Content */}
      <div className="relative z-10 max-w-lg">
        <span className="inline-block bg-[#ccff00] text-black text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
          Photodump
        </span>
        <h3
          className="text-4xl md:text-5xl font-black italic leading-[1.05] tracking-tight text-white mb-4"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          DIFFERENT SCENES
          <br />
          SAME STAR
        </h3>
        <p className="text-sm text-white/40 leading-relaxed mb-6 max-w-md">
          Drop one reference photo and generate consistent character appearances across unlimited scenes, styles, and environments.
        </p>
        <button className="bg-white text-black font-bold px-6 py-3 rounded-full uppercase text-sm hover:bg-white/90 transition-colors">
          Try Photodump
        </button>
      </div>
    </section>
  );
};

export default PhotodumpBanner;
