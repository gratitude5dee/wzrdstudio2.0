import { motion } from 'framer-motion';
import { Shield, Scale, FileCheck } from 'lucide-react';
import { musicTalentRange, type MusicPolishAsset } from '@/lib/musicPolishAssets';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const talentCards = [
  { name: 'Alex Rivera', role: 'Lead Actor', image: musicTalentRange[0] },
  { name: 'Maya Chen', role: 'Voice Artist', image: musicTalentRange[1] },
  { name: 'Jordan Blake', role: 'Motion Ref', image: musicTalentRange[2] },
  { name: 'Sam Nakamura', role: 'Face Model', image: musicTalentRange[3] },
];

const TalentCard = ({ name, role, image }: { name: string; role: string; image: MusicPolishAsset }) => (
  <div className="relative rounded-xl overflow-hidden bg-zinc-800/50 border border-white/5 aspect-[3/4]">
    <img
      src={image.src}
      alt={image.alt}
      className="w-full h-full object-cover"
      loading="lazy"
    />
    <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/80" />
    <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
      <div className="text-[11px] text-white font-medium">{name}</div>
      <div className="text-[10px] text-zinc-400">{role}</div>
    </div>
    <div className="absolute top-2 right-2 bg-emerald-500/20 border border-emerald-500/30 rounded-full px-2 py-0.5">
      <span className="text-[9px] text-emerald-400 font-medium">✓ Consent ready</span>
    </div>
  </div>
);

const GovernanceSection = () => {
  return (
    <section className="py-32 px-6 bg-[#050505] relative overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
          {/* Left — Sticky text */}
          <motion.div className="lg:sticky lg:top-32 lg:self-start" {...fadeUp}>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tighter text-white mb-10 leading-[1.05]">
              Enterprise-Grade
              <br />
              AI Governance
            </h2>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FF5A5A]/10 border border-[#FF5A5A]/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-[#FF5A5A]" />
                </div>
                <div>
                  <h4 className="text-white font-medium mb-1">Enterprise-level controls</h4>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    Granular model permissions, usage quotas, and team-based access control for every AI capability.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FF5A5A]/10 border border-[#FF5A5A]/20 flex items-center justify-center flex-shrink-0">
                  <Scale className="w-5 h-5 text-[#FF5A5A]" />
                </div>
                <div>
                  <h4 className="text-white font-medium mb-1">Compliance & governance</h4>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    Legal safeguards, IP protection, audit trails, and consent management built into every workflow.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FF5A5A]/10 border border-[#FF5A5A]/20 flex items-center justify-center flex-shrink-0">
                  <FileCheck className="w-5 h-5 text-[#FF5A5A]" />
                </div>
                <div>
                  <h4 className="text-white font-medium mb-1">Simplified procurement</h4>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    One contract, one vendor, one invoice — every model, every capability, fully managed.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right — Scrolling cards */}
          <div className="space-y-6">
            {/* Card 1: Permissions Panel */}
            <motion.div
              className="bg-[#121212] border border-white/5 rounded-2xl p-6 overflow-hidden"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
            >
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-4">AI Model Permissions</div>
              <div className="space-y-3">
                {[
                  { name: 'Veo 3.1', team: 'Production', enabled: true },
                  { name: 'Wan 2.5', team: 'Marketing', enabled: false },
                  { name: 'Kling O3 Pro', team: 'All Teams', enabled: true },
                  { name: 'Sora 2', team: 'Directors Only', enabled: true },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div>
                      <div className="text-sm text-white font-medium">{item.name}</div>
                      <div className="text-[11px] text-zinc-500">{item.team}</div>
                    </div>
                    <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.enabled ? 'bg-[#FF5A5A]' : 'bg-zinc-700'}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${item.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Card 2: IP Cleared Talent Library */}
            <motion.div
              className="bg-[#121212] border border-white/5 rounded-2xl p-6"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.2 }}
            >
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-4">IP Cleared Talent Library</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {talentCards.map((talent) => (
                  <TalentCard key={talent.name} {...talent} />
                ))}
              </div>
            </motion.div>

            {/* Card 3: IP Protection & Authorship */}
            <motion.div
              className="bg-[#121212] border border-white/5 rounded-2xl p-6"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.3 }}
            >
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-4">IP Protection & Authorship</div>
              <div className="space-y-3">
                {[
                  { step: 'Prompt', detail: '"Cinematic aerial shot of mountains at dawn"', time: '10:24 AM' },
                  { step: 'Model', detail: 'Veo 3.1 → 4K render, seed: 847291', time: '10:24 AM' },
                  { step: 'Output', detail: 'scene_014_v2.mp4 — 2048×1152, 6s', time: '10:26 AM' },
                  { step: 'License', detail: 'Commercial use cleared — Enterprise tier', time: '10:26 AM' },
                ].map((item, i) => (
                  <div key={`${item.step}-${item.time}`} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-[#FF5A5A] mt-1.5" />
                      {i < 3 && <div className="w-px h-8 bg-white/10" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white font-medium">{item.step}</span>
                        <span className="text-[10px] text-zinc-600">{item.time}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GovernanceSection;
