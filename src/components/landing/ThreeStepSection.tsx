import { motion } from 'framer-motion';

const steps = [
  {
    number: '01',
    title: 'Ideate',
    headline: 'Explore 100s of possibilities',
    description: 'Text, image and video models in one place. No tab-switching, no limits.',
    mockup: (
      <div className="space-y-2 p-3">
        {['Brand concept A', 'Video treatment', 'Visual identity'].map((item, i) => (
          <div key={i} className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
            <div className="w-2 h-2 rounded-full bg-orange-400/50" />
            <span className="text-[10px] text-white/40 font-mono">{item}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-2 border border-dashed border-white/[0.08]">
          <span className="text-[10px] text-white/20 font-mono">+ Add source…</span>
        </div>
      </div>
    ),
  },
  {
    number: '02',
    title: 'Iterate',
    headline: "Get to 'final' faster",
    description: 'Real-time collaboration with AI-powered refinement. Every revision tracked.',
    mockup: (
      <div className="p-3 space-y-3">
        <div className="aspect-video rounded-lg bg-gradient-to-br from-purple-500/20 to-orange-500/10 border border-white/[0.06] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <div className="w-3 h-3 rounded-sm bg-white/30" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-purple-500/10 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span className="text-[8px] text-purple-300/60">Alex</span>
          </div>
          <div className="flex items-center gap-1 bg-orange-500/10 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-[8px] text-orange-300/60">Komal</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: '03',
    title: 'Scale',
    headline: 'Create scalable workflows',
    description: 'Turn one-off creations into repeatable pipelines. From prototype to production.',
    mockup: (
      <div className="p-3 space-y-2">
        {[
          { w: '70%', color: 'bg-orange-500/20 border-orange-500/15' },
          { w: '50%', color: 'bg-blue-500/20 border-blue-500/15' },
          { w: '85%', color: 'bg-orange-500/20 border-orange-500/15' },
        ].map((bar, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            </div>
            <div className="flex-1 h-3 bg-white/[0.02] rounded">
              <div className={`h-full rounded border ${bar.color}`} style={{ width: bar.w }} />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[8px] text-white/20 font-mono">3 workflows active</span>
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        </div>
      </div>
    ),
  },
];

export function ThreeStepSection() {
  return (
    <section className="py-32 px-4 relative">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
              className="group relative rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 overflow-hidden"
            >
              {/* Mockup area */}
              <div className="border-b border-white/[0.06] min-h-[180px]">
                {step.mockup}
              </div>

              {/* Text */}
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-mono text-white/20">{step.number}</span>
                  <span className="text-xs font-mono uppercase tracking-widest text-orange-400/60">{step.title}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.headline}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ThreeStepSection;
