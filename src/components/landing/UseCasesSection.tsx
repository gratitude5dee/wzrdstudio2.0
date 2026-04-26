import { motion } from 'framer-motion';
import { Palette, Shield, Megaphone, Film, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const caseStudies = [
  {
    icon: Palette,
    title: 'Brand System Design',
    subtitle: 'Creative Agencies',
    description:
      'End-to-end brand identity creation — from mood boards to final deliverables — with AI-assisted iteration and real-time collaboration.',
    stats: '3x faster brand sprints',
    gradient: 'from-violet-500/20 to-purple-500/5',
  },
  {
    icon: Shield,
    title: 'Security Operations Content',
    subtitle: 'Cybersecurity Firms',
    description:
      'Generate threat briefings, compliance documentation visuals, and internal training content with enterprise-grade security.',
    stats: 'SOC 2 compliant pipeline',
    gradient: 'from-cyan-500/20 to-blue-500/5',
  },
  {
    icon: Megaphone,
    title: 'Marketing & Advertising',
    subtitle: 'SaaS Companies',
    description:
      'Launch campaigns with 100+ ad variations. A/B test creative at scale and distribute across every paid and organic channel.',
    stats: '10x creative output',
    gradient: 'from-orange-500/20 to-red-500/5',
  },
  {
    icon: Film,
    title: 'Media Distribution Pipeline',
    subtitle: 'Entertainment Studios',
    description:
      'From raw footage to platform-ready delivery. Automated transcoding, localization, and distribution across global territories.',
    stats: '48hr turnaround',
    gradient: 'from-orange-500/20 to-amber-500/5',
  },
];

export function UseCasesSection() {
  return (
    <section className="py-32 px-4 relative">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Case studies from{' '}
            <em style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }} className="bg-clip-text text-transparent bg-gradient-to-r from-white/80 to-white/50">
              creative teams.
            </em>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            See how professionals across SaaS, cybersecurity, film, and media distribution are using WZRD.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {caseStudies.map((study, index) => (
            <motion.div
              key={study.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className={cn(
                'group relative p-8 rounded-2xl overflow-hidden cursor-pointer',
                'bg-gradient-to-br from-white/[0.06] to-white/[0.02]',
                'border border-white/[0.08]',
                'hover:border-white/[0.15]',
                'transition-all duration-500',
              )}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${study.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/[0.1]">
                      <study.icon className="w-6 h-6 text-white/60" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white">{study.title}</h3>
                      <p className="text-sm text-white/40">{study.subtitle}</p>
                    </div>
                  </div>
                </div>

                <p className="text-white/50 mb-6 leading-relaxed">{study.description}</p>

                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm font-semibold text-white/60">
                    {study.stats}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm text-white/30 group-hover:text-white/60 transition-colors">
                    Read more <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default UseCasesSection;
