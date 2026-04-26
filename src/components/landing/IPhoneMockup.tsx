import { motion } from 'framer-motion';

export function IPhoneMockup() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      <div className="container mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Experience WZRD on{' '}
            <em style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }} className="bg-clip-text text-transparent bg-gradient-to-r from-orange-300 to-amber-200">
              mobile.
            </em>
          </h2>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Create, iterate, and publish from anywhere. Your studio fits in your pocket.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40, rotateX: 10 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative mx-auto"
          style={{ width: '280px' }}
        >
          {/* iPhone frame */}
          <div className="relative rounded-[40px] border-[6px] border-white/[0.12] bg-[#0a0a0a] shadow-2xl shadow-black/60 overflow-hidden"
            style={{ aspectRatio: '9/19.5' }}
          >
            {/* Notch / Dynamic Island */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-20" />

            {/* Screen content */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d0d] to-[#111] overflow-hidden">
              {/* Lobster SVG */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 200 200"
                  className="w-40 h-40 opacity-80"
                >
                  <defs>
                    <linearGradient id="phone-lobster-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="hsl(14, 100%, 64%)" />
                      <stop offset="50%" stopColor="hsl(14, 100%, 55%)" />
                      <stop offset="100%" stopColor="hsl(0, 85%, 45%)" />
                    </linearGradient>
                    <filter id="phone-lobster-glow">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <path d="M60 130 C50 110 40 90 55 70 C65 55 80 50 90 55 C95 58 98 65 95 75 C92 82 85 85 80 82 C75 80 73 75 76 70" fill="none" stroke="url(#phone-lobster-gradient)" strokeWidth={2.5} strokeLinecap="round" filter="url(#phone-lobster-glow)" />
                  <path d="M140 130 C150 110 160 90 145 70 C135 55 120 50 110 55 C105 58 102 65 105 75 C108 82 115 85 120 82 C125 80 127 75 124 70" fill="none" stroke="url(#phone-lobster-gradient)" strokeWidth={2.5} strokeLinecap="round" filter="url(#phone-lobster-glow)" />
                  <path d="M100 55 C100 55 90 80 85 100 C82 110 84 125 90 135 C95 142 100 145 100 145 C100 145 105 142 110 135 C116 125 118 110 115 100 C110 80 100 55 100 55Z" fill="none" stroke="url(#phone-lobster-gradient)" strokeWidth={2} strokeLinecap="round" filter="url(#phone-lobster-glow)" opacity={0.7} />
                  <path d="M95 55 C90 40 82 28 70 20" fill="none" stroke="url(#phone-lobster-gradient)" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
                  <path d="M105 55 C110 40 118 28 130 20" fill="none" stroke="url(#phone-lobster-gradient)" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
                  {[0, 1, 2].map((i) => (
                    <ellipse key={i} cx={100} cy={148 + i * 12} rx={10 - i * 2} ry={5} fill="none" stroke="url(#phone-lobster-gradient)" strokeWidth={1.5} opacity={0.5} />
                  ))}
                </svg>
              </div>

              {/* Radial glow behind lobster */}
              <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,107,74,0.15) 0%, transparent 60%)' }} />

              {/* Particle dots */}
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-orange-400/30"
                  style={{
                    left: `${15 + Math.random() * 70}%`,
                    top: `${15 + Math.random() * 70}%`,
                  }}
                  animate={{
                    opacity: [0.1, 0.5, 0.1],
                    scale: [0.8, 1.2, 0.8],
                  }}
                  transition={{
                    duration: 2 + Math.random() * 2,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                  }}
                />
              ))}

              {/* Bottom app UI hint */}
              <div className="absolute bottom-8 left-4 right-4">
                <div className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-3 border border-white/[0.08]">
                  <span className="text-[9px] text-white/40 font-mono uppercase tracking-wider">WZRD Studio</span>
                  <div className="mt-2 flex gap-1.5">
                    <div className="h-1 flex-1 rounded-full bg-orange-500/40" />
                    <div className="h-1 flex-[2] rounded-full bg-white/[0.08]" />
                    <div className="h-1 flex-1 rounded-full bg-white/[0.06]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reflection/glow under phone */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-48 h-16 rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(255,107,74,0.15) 0%, transparent 70%)', filter: 'blur(20px)' }} />
        </motion.div>
      </div>
    </section>
  );
}

export default IPhoneMockup;
