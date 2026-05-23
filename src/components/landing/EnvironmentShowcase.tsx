import { motion } from 'framer-motion';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const EnvironmentShowcase = () => {
  return (
    <section className="py-32 px-6 bg-[#050505] relative overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div className="text-center mb-16" {...fadeUp}>
          <h2 className="text-4xl md:text-6xl font-medium tracking-tighter text-white mb-4">
            Your Generative Environment
          </h2>
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto">
            A unified workspace where AI models, timelines, and creative assets
            converge into one cinematic production pipeline.
          </p>
        </motion.div>

        <motion.div
          className="relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/50"
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.2 }}
        >
          {/* Top gradient fade */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#050505] to-transparent z-10 pointer-events-none" />

          {/* Mock editor UI */}
          <div className="bg-[#0A0A0A] p-1">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                <div className="w-3 h-3 rounded-full bg-[#28CA42]" />
              </div>
              <span className="text-[11px] text-zinc-500 ml-3 tracking-wide uppercase">WZRD Studio — Project Timeline</span>
            </div>

            {/* Editor body */}
            <div className="grid grid-cols-12 gap-[1px] bg-white/5 min-h-[400px] md:min-h-[500px]">
              {/* Left panel - Asset library */}
              <div className="col-span-3 bg-[#0D0D0D] p-4">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-4">Media Library</div>
                <div className="space-y-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="aspect-video rounded-lg bg-zinc-800/50 border border-white/5 overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-br from-zinc-700/30 to-zinc-800/30" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Center - Preview */}
              <div className="col-span-6 bg-[#0A0A0A] flex flex-col">
                <div className="flex-1 flex items-center justify-center p-4">
                  <div className="aspect-video w-full max-w-lg rounded-xl bg-zinc-900 border border-white/5 overflow-hidden relative">
                    <img
                      src="/wzrd-intro.gif"
                      alt="WZRD Studio Preview"
                      className="w-full h-full object-cover opacity-80"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  </div>
                </div>
                {/* Timeline tracks */}
                <div className="border-t border-white/5 p-3 space-y-1.5">
                  {[{ w: '75%', c: '#FF5A5A' }, { w: '60%', c: '#4A9EFF' }, { w: '90%', c: '#50E3C2' }].map((track, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-16 text-[9px] text-zinc-600 truncate">Track {i + 1}</div>
                      <div className="flex-1 h-5 bg-zinc-800/50 rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm opacity-60" style={{ width: track.w, backgroundColor: track.c }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right panel - AI Director */}
              <div className="col-span-3 bg-[#0D0D0D] p-4">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-4">AI Director</div>
                <div className="space-y-3">
                  <div className="rounded-xl bg-zinc-800/30 border border-white/5 p-3">
                    <div className="text-[11px] text-zinc-400">Generate a cinematic drone shot over city skyline at golden hour...</div>
                  </div>
                  <div className="rounded-xl bg-[#FF5A5A]/10 border border-[#FF5A5A]/20 p-3">
                    <div className="text-[11px] text-[#FF5A5A]/80">✓ Scene generated — 4.2s render</div>
                  </div>
                  <div className="rounded-xl bg-zinc-800/30 border border-white/5 p-3">
                    <div className="text-[11px] text-zinc-400">Add dramatic score with tension buildup...</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default EnvironmentShowcase;
