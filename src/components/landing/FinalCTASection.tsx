import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function FinalCTASection() {
  return (
    <section className="py-32 px-4 relative">
      <div className="container mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            A new medium needs{' '}
            <em style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }} className="bg-clip-text text-transparent bg-gradient-to-r from-orange-300 to-amber-200">
              a new canvas.
            </em>
          </h2>
          <p className="text-lg text-white/40 mb-10">
            Pricing starts at $60/month. Start creating today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="mailto:sales@wzrd.studio"
              className="inline-flex items-center gap-2 px-8 py-4 border border-white/10 text-white/80 font-medium rounded-xl hover:bg-white/[0.05] hover:border-white/20 transition-all duration-200 text-base"
            >
              Contact sales
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              to="/login?mode=signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-b from-[#FF6B4A] to-[#e55a3a] text-white font-semibold rounded-xl hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(255,107,74,0.25)] transition-all duration-200 text-base"
            >
              Sign up for free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default FinalCTASection;
