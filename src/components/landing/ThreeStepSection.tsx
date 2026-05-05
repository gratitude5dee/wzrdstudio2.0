import { motion } from 'framer-motion';
import { musicPolishAssets, type MusicPolishAsset } from '@/lib/musicPolishAssets';

const StepMockup = ({ image, label }: { image: MusicPolishAsset; label: string }) => (
  <div className="relative min-h-[180px] overflow-hidden">
    <img
      src={image.src}
      alt={image.alt}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      loading="lazy"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md">
      <span className="text-[10px] font-mono uppercase tracking-widest text-white/60">{label}</span>
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.8)]" />
    </div>
  </div>
);

const steps = [
  {
    number: '01',
    title: 'Ideate',
    headline: 'Explore 100s of possibilities',
    description: 'Text, image and video models in one place. No tab-switching, no limits.',
    mockup: <StepMockup image={musicPolishAssets.kanvas.aiVisualWall} label="Concept wall" />,
  },
  {
    number: '02',
    title: 'Iterate',
    headline: "Get to 'final' faster",
    description: 'Real-time collaboration with AI-powered refinement. Every revision tracked.',
    mockup: <StepMockup image={musicPolishAssets.kanvas.backgroundReframe} label="Revision bay" />,
  },
  {
    number: '03',
    title: 'Scale',
    headline: 'Create scalable workflows',
    description: 'Turn one-off creations into repeatable pipelines. From prototype to production.',
    mockup: <StepMockup image={musicPolishAssets.landing.platformDeliveryWall} label="Delivery stack" />,
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
