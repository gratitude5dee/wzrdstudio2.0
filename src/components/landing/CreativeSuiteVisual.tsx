import { motion } from 'framer-motion';
import { Layers, Film, Image as ImageIcon, Wand2 } from 'lucide-react';

export const CreativeSuiteVisual = () => {
  return (
    <div className="relative w-full h-64 flex items-center justify-center overflow-hidden rounded-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative w-full h-full bg-gradient-to-br from-red-950/30 via-orange-950/20 to-black rounded-xl border border-red-500/20 p-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-red-400" />
            <span className="text-xs text-white/60">STORYBOARD</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 bg-red-500/20 rounded text-xs text-red-400">
              Share
            </button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.02 }}
              className="aspect-square bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded border border-white/10 flex items-center justify-center"
            >
              {i % 3 === 0 ? (
                <ImageIcon className="w-3 h-3 text-red-400/50" />
              ) : i % 3 === 1 ? (
                <Film className="w-3 h-3 text-orange-400/50" />
              ) : (
                <Wand2 className="w-3 h-3 text-blue-400/50" />
              )}
            </motion.div>
          ))}
        </div>

        <div className="absolute left-4 top-16 w-16 space-y-2">
          <div className="w-8 h-8 bg-red-500/20 rounded flex items-center justify-center">
            <Layers className="w-4 h-4 text-red-400" />
          </div>
          <div className="w-8 h-8 bg-orange-500/20 rounded flex items-center justify-center">
            <Film className="w-4 h-4 text-orange-400" />
          </div>
          <div className="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-blue-400" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};