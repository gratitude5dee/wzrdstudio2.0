import { motion } from 'framer-motion';

interface LobsterSilhouetteProps {
  phase: 'abyss' | 'emergence' | 'ignition' | 'reveal' | 'complete';
}

const LobsterSilhouette = ({ phase }: LobsterSilhouetteProps) => {
  const isVisible = phase === 'emergence' || phase === 'ignition';
  
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{
        opacity: phase === 'emergence' ? 1 : phase === 'ignition' ? 0 : 0,
        scale: phase === 'ignition' ? 1.5 : 1,
      }}
      transition={{ duration: phase === 'ignition' ? 0.4 : 0.8 }}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-48 h-48 md:w-64 md:h-64"
        style={{ willChange: 'transform' }}
      >
        <defs>
          <linearGradient id="lobster-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(14, 100%, 64%)" />
            <stop offset="50%" stopColor="hsl(14, 100%, 55%)" />
            <stop offset="100%" stopColor="hsl(0, 85%, 45%)" />
          </linearGradient>
          <filter id="lobster-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        
        {/* Stylized lobster claw - left */}
        <motion.path
          d="M60 130 C50 110 40 90 55 70 C65 55 80 50 90 55 C95 58 98 65 95 75 C92 82 85 85 80 82 C75 80 73 75 76 70"
          fill="none"
          stroke="url(#lobster-gradient)"
          strokeWidth={2.5}
          strokeLinecap="round"
          filter={isVisible ? "url(#lobster-glow)" : undefined}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: isVisible ? 1 : 0,
            opacity: isVisible ? 1 : 0,
          }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
        
        {/* Stylized lobster claw - right */}
        <motion.path
          d="M140 130 C150 110 160 90 145 70 C135 55 120 50 110 55 C105 58 102 65 105 75 C108 82 115 85 120 82 C125 80 127 75 124 70"
          fill="none"
          stroke="url(#lobster-gradient)"
          strokeWidth={2.5}
          strokeLinecap="round"
          filter={isVisible ? "url(#lobster-glow)" : undefined}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: isVisible ? 1 : 0,
            opacity: isVisible ? 1 : 0,
          }}
          transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.2 }}
        />
        
        {/* Body center */}
        <motion.path
          d="M100 55 C100 55 90 80 85 100 C82 110 84 125 90 135 C95 142 100 145 100 145 C100 145 105 142 110 135 C116 125 118 110 115 100 C110 80 100 55 100 55Z"
          fill="none"
          stroke="url(#lobster-gradient)"
          strokeWidth={2}
          strokeLinecap="round"
          filter={isVisible ? "url(#lobster-glow)" : undefined}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: isVisible ? 1 : 0,
            opacity: isVisible ? 0.7 : 0,
          }}
          transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.4 }}
        />

        {/* Antennae */}
        <motion.path
          d="M95 55 C90 40 82 28 70 20"
          fill="none"
          stroke="url(#lobster-gradient)"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: isVisible ? 1 : 0,
            opacity: isVisible ? 0.6 : 0,
          }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.6 }}
        />
        <motion.path
          d="M105 55 C110 40 118 28 130 20"
          fill="none"
          stroke="url(#lobster-gradient)"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: isVisible ? 1 : 0,
            opacity: isVisible ? 0.6 : 0,
          }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.7 }}
        />

        {/* Tail segments */}
        {[0, 1, 2].map((i) => (
          <motion.ellipse
            key={i}
            cx={100}
            cy={148 + i * 12}
            rx={10 - i * 2}
            ry={5}
            fill="none"
            stroke="url(#lobster-gradient)"
            strokeWidth={1.5}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: isVisible ? 0.5 : 0,
              scale: isVisible ? 1 : 0,
            }}
            transition={{ duration: 0.5, delay: 0.8 + i * 0.15 }}
          />
        ))}
      </svg>
    </motion.div>
  );
};

export default LobsterSilhouette;
