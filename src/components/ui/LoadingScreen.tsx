import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useMemo, useEffect, useState, useCallback, Component, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { loadingVertexShader, loadingFragmentShader } from './shaders/loading-shaders';

/* ─── WebGL Detection ─── */
function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/* ─── Error Boundary ─── */
class WebGLErrorBoundary extends Component<
  { fallback: ReactNode; onError?: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

/* ─── Create text texture with Canvas2D ─── */
function createTextTexture(text: string, fontSize = 32): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio, 2);
  
  ctx.font = `${fontSize}px "Inter", "SF Pro Display", -apple-system, sans-serif`;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + 40);
  const h = Math.ceil(fontSize * 2);
  
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  
  ctx.clearRect(0, 0, w, h);
  ctx.font = `300 ${fontSize}px "Inter", "SF Pro Display", -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.letterSpacing = '0.25em';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/* ─── Fullscreen Shader Quad ─── */
function ShaderQuad({ phase }: { phase: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport, size } = useThree();

  const [logoTex, setLogoTex] = useState<THREE.Texture | null>(null);
  const textTex = useMemo(() => createTextTexture('WZRD STUDIO', 28), []);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('/lovable-uploads/wzrdtechlogo.png', (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      setLogoTex(tex);
    });
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPhase: { value: 0 },
    uLogo: { value: new THREE.Texture() },
    uText: { value: textTex },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
  }), [textTex, size.width, size.height]);

  useEffect(() => {
    if (logoTex) uniforms.uLogo.value = logoTex;
  }, [logoTex, uniforms]);

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [size, uniforms]);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uPhase.value += (phase - uniforms.uPhase.value) * 3.0 * delta;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <shaderMaterial
        vertexShader={loadingVertexShader}
        fragmentShader={loadingFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/* ─── Particle System ─── */
function Particles({ phase }: { phase: number }) {
  const ref = useRef<THREE.Points>(null);
  const count = 300;

  const [positions, velocities, sizes, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 4 + 1;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = Math.sin(angle) * radius;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
      vel[i * 3] = -Math.cos(angle) * 0.012;
      vel[i * 3 + 1] = -Math.sin(angle) * 0.012;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
      sz[i] = Math.random() * 0.06 + 0.02;
      // Orange → white gradient
      const t = Math.random();
      col[i * 3] = 1.0;
      col[i * 3 + 1] = 0.4 + t * 0.55;
      col[i * 3 + 2] = 0.1 + t * 0.8;
    }
    return [pos, vel, sz, col] as const;
  }, []);

  useFrame(() => {
    if (!ref.current) return; // Start immediately
    const arr = (ref.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const speed = phase > 1.5 ? 0.6 : 1.8;
    for (let i = 0; i < count; i++) {
      arr[i * 3] += velocities[i * 3] * speed;
      arr[i * 3 + 1] += velocities[i * 3 + 1] * speed;
      arr[i * 3 + 2] += velocities[i * 3 + 2];
      const d = Math.sqrt(arr[i * 3] ** 2 + arr[i * 3 + 1] ** 2);
      if (d < 0.15) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 3 + 2;
        arr[i * 3] = Math.cos(angle) * radius;
        arr[i * 3 + 1] = Math.sin(angle) * radius;
      }
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  const opacity = phase < 0.1 ? 0 : phase > 3 ? Math.max(0, 1 - (phase - 3)) : 0.8;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial
        color="#FF8844"
        size={0.05}
        transparent
        opacity={opacity}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ─── Scene ─── */
function Scene({ phase }: { phase: number }) {
  return (
    <>
      <color attach="background" args={['#000000']} />
      <ShaderQuad phase={phase} />
      <Particles phase={phase} />
    </>
  );
}

/* ─── CSS Fallback ─── */
function CSSFallback({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black overflow-hidden">
      <motion.div
        className="w-[min(600px,80vw)] h-[min(600px,80vh)] rounded-full absolute"
        style={{ background: 'radial-gradient(circle, hsla(24,100%,50%,0.15) 0%, transparent 70%)' }}
        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.img
        src="/lovable-uploads/wzrdtechlogo.png"
        alt="WZRD"
        className="w-32 h-32 sm:w-48 sm:h-48 object-contain relative z-10"
        initial={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
      <motion.p
        className="text-xs text-white/30 tracking-[0.2em] uppercase mt-6 relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        {message}
      </motion.p>
    </div>
  );
}

/* ─── Main Component ─── */
interface LoadingScreenProps {
  isLoading: boolean;
  message?: string;
}

export function LoadingScreen({ isLoading, message = 'Initializing studio…' }: LoadingScreenProps) {
  const [webglOk] = useState(() => isWebGLAvailable());
  const [phase, setPhase] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);

  // Phase timeline: 0→void, 1→ignite, 2→bloom, 3→reveal, 4→resolve
  useEffect(() => {
    if (!isLoading) return;
    const start = performance.now();
    let raf: number;
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      // Map 0-2.5s to phase 0-4
      setPhase(Math.min(elapsed * 1.6, 4));
      if (elapsed < 2.5) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isLoading]);

  const handleWebGLError = useCallback(() => setWebglFailed(true), []);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9999] bg-black"
        >
          {webglOk && !webglFailed ? (
            <WebGLErrorBoundary fallback={<CSSFallback message={message} />} onError={handleWebGLError}>
              <Canvas
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
                camera={{ position: [0, 0, 5], fov: 50 }}
                style={{ background: '#000000' }}
                fallback={<CSSFallback message={message} />}
              >
                <Scene phase={phase} />
              </Canvas>
              {/* Message overlay */}
              <motion.p
                className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs text-white/30 tracking-[0.2em] uppercase z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                {message}
              </motion.p>
            </WebGLErrorBoundary>
          ) : (
            <CSSFallback message={message} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LoadingScreen;
