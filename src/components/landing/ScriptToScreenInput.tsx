import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const ScriptToScreenInput = () => {
  return (
    <section className="py-32 px-6 bg-black relative">
      <div className="max-w-4xl mx-auto text-center">
        <motion.h2
          className="text-4xl md:text-6xl font-medium tracking-tighter text-white mb-6"
          {...fadeUp}
        >
          From Script to Screen
        </motion.h2>
        <motion.p
          className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto mb-16"
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.15 }}
        >
          From ideation to performance, WZRD unites creative teams with
          AI-powered tools that turn a single sentence into cinematic production.
        </motion.p>

        <motion.div
          className="max-w-4xl w-full mx-auto p-[1px] rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent"
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.3 }}
        >
          <div className="bg-[#1C1C1C] rounded-[1.9rem] flex flex-col justify-between h-48 p-6 relative group">
            <textarea
              placeholder="Describe your film in a sentence or two..."
              className="bg-transparent text-white w-full h-full resize-none outline-none placeholder:text-zinc-600 text-lg font-light"
              readOnly
            />
            <button className="absolute bottom-6 right-6 w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-white/10">
              <Sparkles className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ScriptToScreenInput;
