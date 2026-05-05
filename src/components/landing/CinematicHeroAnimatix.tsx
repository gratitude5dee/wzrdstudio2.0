import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { musicPolishAssets } from '@/lib/musicPolishAssets';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const InlineMedia = ({ src, alt, delay = 0 }: { src: string; alt: string; delay?: number }) => (
  <motion.span
    className="inline-block align-middle w-[14vw] h-[7vw] min-w-[100px] min-h-[50px] rounded-full overflow-hidden mx-2 shadow-2xl shadow-white/10 bg-zinc-800/50 border border-white/10"
    initial={{ opacity: 0, scale: 0.8 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
  >
    <img src={src} className="w-full h-full object-cover" alt={alt} loading="lazy" />
  </motion.span>
);

const CinematicHeroAnimatix = () => {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center pt-32 pb-20 px-6 text-center bg-black relative overflow-hidden">
      {/* Subtle radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,90,90,0.04) 0%, transparent 60%)' }} />

      <motion.h1
        className="text-5xl md:text-[6.5vw] leading-[1.08] font-medium tracking-tighter text-white max-w-6xl relative z-10"
        {...fadeUp}
      >
        The{' '}
        <InlineMedia
          src={musicPolishAssets.cinema.performanceCloseup.src}
          alt={musicPolishAssets.cinema.performanceCloseup.alt}
          delay={0.2}
        />{' '}
        AI video
        <br className="hidden md:block" />
        {' '}production{' '}
        <InlineMedia
          src={musicPolishAssets.cinema.soundstage.src}
          alt={musicPolishAssets.cinema.soundstage.alt}
          delay={0.4}
        />{' '}
        pipeline
        <br className="hidden md:block" />
        {' '}for{' '}
        <InlineMedia
          src={musicPolishAssets.landing.rooftopChoreography.src}
          alt={musicPolishAssets.landing.rooftopChoreography.alt}
          delay={0.6}
        />{' '}
        the agencies
      </motion.h1>

      <motion.p
        className="mt-10 text-zinc-400 max-w-xl text-lg md:text-xl text-center md:text-left relative z-10"
        {...fadeUp}
        transition={{ ...fadeUp.transition, delay: 0.3 }}
      >
        Create, iterate, and deliver cinematic ads, films, and stories
        <br className="hidden md:block" />
        — all powered by enterprise-grade AI orchestration.
      </motion.p>

      <motion.div
        className="mt-10 flex items-center gap-4 relative z-10"
        {...fadeUp}
        transition={{ ...fadeUp.transition, delay: 0.5 }}
      >
        <Link
          to="/login?mode=signup"
          className="bg-white text-black px-7 py-3.5 rounded-full font-medium hover:bg-zinc-200 transition-colors text-sm"
        >
          Get Started
        </Link>
        <Link
          to="/demo"
          className="bg-transparent text-white border border-white/20 px-7 py-3.5 rounded-full font-medium hover:bg-white/10 transition-colors text-sm"
        >
          Book Demo
        </Link>
      </motion.div>
    </section>
  );
};

export default CinematicHeroAnimatix;
