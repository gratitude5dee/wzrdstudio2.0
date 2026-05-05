import { motion } from 'framer-motion';
import { musicPolishAssets, type MusicPolishAsset } from '@/lib/musicPolishAssets';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

interface ModelCategory {
  title: string;
  description: string;
  models: string[];
  image: MusicPolishAsset;
}

const categories: ModelCategory[] = [
  {
    title: 'Video',
    description: 'Generate motion with keyframe and camera controls with natural physics.',
    models: ['Veo 3.1', 'Kling O3 Pro', 'Seedance 1.5 Pro', 'Sora 2', 'LTX-2 Fast'],
    image: musicPolishAssets.cinema.neonStreet,
  },
  {
    title: 'Voice',
    description: 'Clone voices, generate narration, and produce dialogue with emotional range.',
    models: ['ElevenLabs V3', 'Sesame CSM', 'Fish Speech 1.5', 'Kokoro 82M'],
    image: musicPolishAssets.blueprints.microphone,
  },
  {
    title: 'Story Script',
    description: 'Write screenplays, storyboards, and shot lists with structured AI direction.',
    models: ['Claude Sonnet 4.6', 'GPT-4.1 Pro', 'Gemini 2.5 Pro', 'DeepSeek R2'],
    image: musicPolishAssets.cinema.castBoard,
  },
  {
    title: 'Sound FX & Music',
    description: 'Score films, design sound effects, and generate ambient audio landscapes.',
    models: ['MMAudio', 'Stable Audio 2', 'Udio v2', 'Suno v4'],
    image: musicPolishAssets.cinema.soundstage,
  },
  {
    title: 'Image',
    description: 'Create stills, concept art, matte paintings, and character reference sheets.',
    models: ['Flux 1.1 Ultra', 'DALL·E 4', 'Midjourney v7', 'Ideogram 3.0'],
    image: musicPolishAssets.landing.heroGothicStorm,
  },
  {
    title: 'Upscaling',
    description: 'Enhance resolution, restore footage, and refine details to broadcast quality.',
    models: ['Topaz AI 4x', 'Real-ESRGAN', 'Aura SR v2', 'Creative Upscaler'],
    image: musicPolishAssets.toolSurfaces.editWorkbench,
  },
];

const ModelToggle = ({ name, index }: { name: string; index: number }) => (
  <motion.label
    className="flex items-center gap-3 cursor-pointer group"
    initial={{ opacity: 0, x: -10 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.4, delay: 0.1 * index, ease: [0.22, 1, 0.36, 1] }}
  >
    <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-[#FF5A5A] flex-shrink-0 transition-colors">
      <span className="translate-x-4 inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm" />
    </div>
    <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
      {name}
    </span>
  </motion.label>
);

const ModelCard = ({ category, index }: { category: ModelCategory; index: number }) => (
  <motion.div
    className="overflow-hidden rounded-3xl border border-white/5 bg-[#121212]"
    {...fadeUp}
    transition={{ ...fadeUp.transition, delay: 0.1 * index }}
  >
    <div className="relative h-28 border-b border-white/5">
      <img
        src={category.image.src}
        alt={category.image.alt}
        className="h-full w-full object-cover opacity-75"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/25 to-transparent" />
    </div>
    <div className="p-8">
      <h3 className="text-2xl md:text-3xl font-medium text-white mb-2">{category.title}</h3>
      <p className="text-zinc-500 mb-8 text-sm leading-relaxed">{category.description}</p>
      <div className="flex flex-col gap-4">
        {category.models.map((model, i) => (
          <ModelToggle key={model} name={model} index={i} />
        ))}
      </div>
    </div>
  </motion.div>
);

const ModelEcosystemGrid = () => {
  return (
    <section className="py-32 px-6 bg-black relative">
      <div className="max-w-6xl mx-auto">
        <motion.div className="text-center mb-20" {...fadeUp}>
          <h2 className="text-4xl md:text-6xl font-medium tracking-tighter text-white mb-4">
            Every model. One workflow.
          </h2>
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto">
            Toggle between the world's best AI models across every modality —
            video, voice, script, music, image, and upscaling — all in a single pipeline.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((category, index) => (
            <ModelCard key={category.title} category={category} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ModelEcosystemGrid;
