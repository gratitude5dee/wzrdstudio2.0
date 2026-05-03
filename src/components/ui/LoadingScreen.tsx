import { AnimatePresence, motion } from 'framer-motion';

interface LoadingScreenProps {
  isLoading: boolean;
  message?: string;
  enableWebGL?: boolean;
}

function CSSFallback({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-black">
      <motion.div
        className="absolute h-[min(600px,80vh)] w-[min(600px,80vw)] rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(24,100%,50%,0.15) 0%, transparent 70%)' }}
        animate={{ scale: [0.86, 1.12, 0.86], opacity: [0.3, 0.56, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.img
        src="/lovable-uploads/wzrdtechlogo.png"
        alt="WZRD"
        className="relative z-10 h-32 w-32 object-contain sm:h-48 sm:w-48"
        initial={{ opacity: 0, scale: 0.9, filter: 'blur(16px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <motion.p
        className="relative z-10 mt-6 text-xs uppercase tracking-[0.2em] text-white/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        {message}
      </motion.p>
    </div>
  );
}

export function LoadingScreen({
  isLoading,
  message = 'Initializing studio...',
}: LoadingScreenProps) {
  return (
    <AnimatePresence>
      {isLoading ? (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9999] bg-black"
        >
          <CSSFallback message={message} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
