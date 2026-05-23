import { motion } from 'framer-motion';

interface AddSceneButtonProps {
  onClick: () => void;
  className?: string;
}

export const AddSceneButton = ({ onClick, className }: AddSceneButtonProps) => {
  return (
    <motion.button
      onClick={onClick}
      className={`relative h-12 w-12 rounded-lg border border-[#f97316]/25 bg-gradient-to-br from-[#151515] to-[#1d1d1d] ${className ?? ''}`}
      whileHover={{ rotate: 90, scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      aria-label="Add first scene"
    >
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-2xl text-[#FDE8D0]"
        whileHover={{ rotate: -90 }}
      >
        +
      </motion.span>
      <span className="pointer-events-none absolute inset-0 rounded-lg border border-[#f97316]/20" />
    </motion.button>
  );
};

export default AddSceneButton;
