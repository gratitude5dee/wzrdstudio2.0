import { motion } from 'framer-motion';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const cases = [
  {
    label: 'Commercials',
    image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&h=450&fit=crop',
  },
  {
    label: 'Animations',
    image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&h=450&fit=crop',
  },
  {
    label: 'Films',
    image: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&h=450&fit=crop',
  },
];

const UseCasesShowcase = () => {
  return (
    <section className="py-32 px-6 bg-black relative">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-4xl md:text-6xl font-medium tracking-tighter text-white text-center mb-20"
          {...fadeUp}
        >
          From 30 second commercials
          <br className="hidden md:block" />
          to 90 minute films
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cases.map((item, index) => (
            <motion.div
              key={item.label}
              className="group cursor-pointer"
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.15 * index }}
            >
              <div className="aspect-video rounded-2xl overflow-hidden border border-white/5 bg-zinc-900">
                <img
                  src={item.image}
                  alt={item.label}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <h3 className="mt-4 text-xl md:text-2xl font-medium text-white tracking-tight">
                {item.label}
              </h3>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCasesShowcase;
