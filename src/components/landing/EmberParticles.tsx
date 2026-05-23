import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface EmberParticlesProps {
  phase: 'abyss' | 'emergence' | 'ignition' | 'reveal' | 'complete';
}

interface Particle {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  size: number;
  color: string;
  delay: number;
  speed: number;
  angle: number;
}

const EMBER_COLORS = [
  'hsl(0, 85%, 35%)',     // deep red
  'hsl(10, 90%, 45%)',    // dark coral
  'hsl(14, 100%, 55%)',   // coral
  'hsl(14, 100%, 64%)',   // bright coral
  'hsl(25, 100%, 60%)',   // orange
  'hsl(35, 100%, 65%)',   // bright orange
  'hsl(45, 100%, 85%)',   // white-hot
];

const EmberParticles = ({ phase }: EmberParticlesProps) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const count = isMobile ? 60 : 120;

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radius = 30 + Math.random() * 20;
      return {
        id: i,
        startX: Math.random() * 100,
        startY: Math.random() * 100,
        targetX: 50 + Math.cos(angle) * radius,
        targetY: 50 + Math.sin(angle) * radius,
        size: 2 + Math.random() * 4,
        color: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)],
        delay: Math.random() * 1.5,
        speed: 0.5 + Math.random() * 1.5,
        angle: angle * (180 / Math.PI),
      };
    });
  }, [count]);

  const getParticlePosition = (p: Particle) => {
    switch (phase) {
      case 'abyss':
        return { x: `${p.startX}%`, y: `${p.startY}%`, opacity: 0, scale: 0 };
      case 'emergence':
        return { x: `${p.targetX}%`, y: `${p.targetY}%`, opacity: 1, scale: 1 };
      case 'ignition': {
        const explodeAngle = Math.atan2(p.targetY - 50, p.targetX - 50);
        const dist = 60 + Math.random() * 40;
        return {
          x: `${50 + Math.cos(explodeAngle) * dist}%`,
          y: `${50 + Math.sin(explodeAngle) * dist}%`,
          opacity: 0.6,
          scale: 0.5,
        };
      }
      case 'reveal':
      case 'complete':
        return { x: `${p.startX}%`, y: `${p.startY}%`, opacity: 0, scale: 0 };
    }
  };

  if (phase === 'complete') return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => {
        const pos = getParticlePosition(p);
        return (
          <motion.div
            key={p.id}
            className="absolute"
            style={{
              width: p.size,
              height: p.size * 1.8,
              borderRadius: '50% 50% 50% 0',
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              rotate: `${p.angle}deg`,
              willChange: 'transform, opacity',
            }}
            initial={{ x: `${p.startX}%`, y: `${p.startY}%`, opacity: 0, scale: 0 }}
            animate={pos}
            transition={{
              duration: phase === 'ignition' ? 0.5 : 1.2 + p.speed * 0.3,
              delay: phase === 'ignition' ? p.delay * 0.15 : p.delay,
              ease: phase === 'ignition' ? 'easeOut' : [0.25, 0.46, 0.45, 0.94],
            }}
          />
        );
      })}
    </div>
  );
};

export default EmberParticles;
