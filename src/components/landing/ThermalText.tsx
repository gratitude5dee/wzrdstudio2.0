import { motion } from 'framer-motion';

interface ThermalTextProps {
  text: string;
  className?: string;
  delay?: number;
  isVisible: boolean;
  subtitle?: boolean;
}

const ThermalText = ({ text, className = '', delay = 0, isVisible, subtitle = false }: ThermalTextProps) => {
  const letters = text.split('');
  const stagger = subtitle ? 0.02 : 0.04;

  return (
    <div className={`relative inline-flex flex-wrap justify-center ${className}`}>
      {letters.map((letter, i) => (
        <motion.span
          key={`${letter}-${i}`}
          className="relative inline-block"
          style={{ willChange: 'transform, opacity, filter' }}
          initial={{
            opacity: 0,
            scale: 1.3,
            filter: 'brightness(3) blur(4px)',
          }}
          animate={
            isVisible
              ? {
                  opacity: 1,
                  scale: 1,
                  filter: 'brightness(1) blur(0px)',
                }
              : {
                  opacity: 0,
                  scale: 1.3,
                  filter: 'brightness(3) blur(4px)',
                }
          }
          transition={{
            duration: 0.5,
            delay: delay + i * stagger,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          {/* Glow behind letter */}
          {isVisible && !subtitle && (
            <motion.span
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, hsla(14, 100%, 64%, 0.4) 0%, transparent 70%)',
                filter: 'blur(8px)',
                willChange: 'opacity',
              }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.1,
                ease: 'easeInOut',
              }}
            />
          )}
          <span className="relative z-10">
            {letter === ' ' ? '\u00A0' : letter}
          </span>
        </motion.span>
      ))}
    </div>
  );
};

export default ThermalText;
