import { motion } from 'framer-motion';

interface CausticOverlayProps {
  phase: 'abyss' | 'emergence' | 'ignition' | 'reveal' | 'complete';
}

const CausticOverlay = ({ phase }: CausticOverlayProps) => {
  const warmth = phase === 'abyss' ? 0 : phase === 'emergence' ? 0.3 : 0.7;
  
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === 'complete' ? 0 : 0.6 }}
      transition={{ duration: 1 }}
    >
      <svg width="100%" height="100%" className="absolute inset-0">
        <defs>
          <filter id="caustic-filter" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015"
              numOctaves={3}
              seed={42}
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                values="0.015;0.025;0.015"
                dur="8s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={40}
              xChannelSelector="R"
              yChannelSelector="G"
            />
            <feGaussianBlur stdDeviation="2" />
          </filter>
          
          <radialGradient id="caustic-gradient" cx="50%" cy="50%" r="60%">
            <stop
              offset="0%"
              stopColor={`hsl(${200 - warmth * 186}, ${70 + warmth * 30}%, ${30 + warmth * 20}%)`}
              stopOpacity={0.15}
            />
            <stop
              offset="40%"
              stopColor={`hsl(${210 - warmth * 196}, ${60 + warmth * 40}%, ${20 + warmth * 15}%)`}
              stopOpacity={0.1}
            />
            <stop offset="100%" stopColor="transparent" stopOpacity={0} />
          </radialGradient>
        </defs>
        
        <rect
          width="100%"
          height="100%"
          fill="url(#caustic-gradient)"
          filter="url(#caustic-filter)"
          className="animate-caustic-shift"
        />
      </svg>
      
      {/* Animated light rays */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              width: '2px',
              height: '120%',
              background: `linear-gradient(180deg, transparent 0%, hsla(${14 + i * 5}, 100%, ${64 + i * 3}%, ${0.05 + warmth * 0.08}) 40%, transparent 80%)`,
              left: `${15 + i * 18}%`,
              top: '-10%',
              transform: `rotate(${-15 + i * 8}deg)`,
              willChange: 'transform, opacity',
            }}
            animate={{
              opacity: [0, 0.4 + warmth * 0.4, 0],
              x: [0, 20, 0],
            }}
            transition={{
              duration: 4 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.8,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default CausticOverlay;
