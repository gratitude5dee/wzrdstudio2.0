import { motion } from 'framer-motion';
import { musicPolishAssets } from '@/lib/musicPolishAssets';

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
              <img
                src={musicPolishAssets.landing.mobileEditorPortrait.src}
                alt={musicPolishAssets.landing.mobileEditorPortrait.alt}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/55" />

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
