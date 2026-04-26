import { motion } from 'framer-motion';
import { Shield, Zap, Network, Sparkles, Layers, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

const features = [
  { icon: Zap, title: 'Content at Scale', description: 'Generate hundreds of ad variations, social assets, and marketing content for SaaS go-to-market teams in minutes, not weeks.', highlight: '100x Output', color: 'orange' },
  { icon: Shield, title: 'Secure Asset Pipeline', description: 'Enterprise-grade security for cybersecurity firms. SOC 2 compliant workflows with encrypted asset management and audit trails.', highlight: 'SOC 2 Ready', color: 'orange' },
  { icon: Network, title: 'Distribution Engine', description: 'Media & entertainment distribution at scale. Transcode, format, and deliver content across every platform and territory automatically.', highlight: 'Global Reach', color: 'orange' },
  { icon: Sparkles, title: 'AI-Powered Creative', description: 'Let AI handle the heavy lifting. Generate storyboards, visuals, and edits from a simple text prompt or reference image.', highlight: 'Text to Video', color: 'orange' },
  { icon: Layers, title: 'Platform-Ready Formats', description: 'Export optimized for TikTok, Instagram, YouTube Shorts, CTV, and paid ads. Every aspect ratio, every platform, instantly.', highlight: 'All Platforms', color: 'orange' },
  { icon: Workflow, title: 'Enterprise Workflows', description: 'Approval chains, brand governance, and team permissions. Built for organizations that need control without sacrificing speed.', highlight: 'Team Scale', color: 'orange' },
];

export function FeatureGrid() {
  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };

  return (
    <section className="py-32 px-4 relative">
      <div className="container mx-auto max-w-7xl">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-20">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-sm text-orange-300 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Platform Capabilities
          </span>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            An editor with{' '}
            <em style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }} className="bg-clip-text text-transparent bg-gradient-to-r from-orange-300 to-amber-200">
              superpowers.
            </em>
          </h2>

          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            A full suite of AI features that speed up the boring parts, without taking control away.
          </p>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className={cn(
                'group relative p-8 rounded-2xl',
                'bg-gradient-to-b from-white/[0.05] to-transparent',
                'border border-white/[0.08]',
                'hover:border-orange-500/30 hover:bg-white/[0.08]',
                'transition-all duration-500',
              )}
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none" />

              <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center mb-6', 'bg-orange-500/10 border border-orange-500/20', 'group-hover:bg-orange-500/20 group-hover:border-orange-500/30', 'transition-all duration-300')}>
                <feature.icon className="w-7 h-7 text-orange-400" />
              </div>

              <span className={cn('inline-block px-2.5 py-1 rounded-md text-xs font-semibold mb-4', 'bg-orange-500/20 text-orange-300')}>
                {feature.highlight}
              </span>

              <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
              <p className="text-white/50 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default FeatureGrid;
