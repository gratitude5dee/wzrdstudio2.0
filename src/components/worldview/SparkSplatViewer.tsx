import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Loader2, Globe2, AlertCircle } from 'lucide-react';

export interface SparkSplatViewerHandle {
  captureFrame: () => string | null;
}

/**
 * SparkSplatViewer — Renders a Gaussian splat (.spz/.ply/.splat) file
 * using SparkJS from @sparkjsdev/spark with THREE.js.
 *
 * Falls back to an iframe viewer or static image if SparkJS fails to load.
 */
export const SparkSplatViewer = forwardRef<
  SparkSplatViewerHandle,
  {
    splatUrl?: string;
    viewerUrl?: string;
    fallbackImageUrl?: string;
    displayName?: string;
    className?: string;
  }
>(function SparkSplatViewer(
  { splatUrl, viewerUrl, fallbackImageUrl, displayName, className = '' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wasmFailed, setWasmFailed] = useState(false);

  // Store renderer internals for capture
  const internalsRef = useRef<{
    renderer: import('three').WebGLRenderer;
    scene: import('three').Scene;
    camera: import('three').PerspectiveCamera;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    captureFrame() {
      const internals = internalsRef.current;
      if (!internals) return null;
      const { renderer, scene, camera } = internals;
      // Force a render so the buffer is fresh
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!splatUrl) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let animId: number;

    // Catch async WASM failures that escape try/catch
    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? '');
      if (msg.includes('wasm') || msg.includes('WASM') || msg.includes('sparkjs') || msg.includes('SparkRenderer')) {
        console.warn('Caught unhandled WASM rejection:', e.reason);
        if (!cancelled) {
          setWasmFailed(true);
          setLoading(false);
        }
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any;
    let resizeObserver: ResizeObserver;

    async function initSpark() {
      try {
        setLoading(true);
        setError(null);

        const [sparkModule, THREE] = await Promise.all([
          import('@sparkjsdev/spark'),
          import('three'),
        ]);

        if (cancelled) return;

        const { SparkRenderer, SplatMesh } = sparkModule;

        // Create THREE renderer with preserveDrawingBuffer for capture
        renderer = new THREE.WebGLRenderer({
          antialias: false,
          alpha: true,
          preserveDrawingBuffer: true,
        });
        renderer.setSize(container!.clientWidth, container!.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container!.innerHTML = '';
        container!.appendChild(renderer.domElement);

        // Create scene & camera
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          60,
          container!.clientWidth / container!.clientHeight,
          0.1,
          1000,
        );
        camera.position.set(0, 1.6, 3);
        camera.lookAt(0, 0, 0);

        // Init SparkJS renderer
        const spark = new SparkRenderer({ renderer });

        // Add spark to scene (required by SparkJS docs)
        scene.add(spark as unknown as import('three').Object3D);

        // Load splat via SplatMesh — wrapped for WASM failure
        let splatMesh: InstanceType<typeof SplatMesh>;
        try {
          splatMesh = new SplatMesh({
            url: splatUrl!,
            onLoad: () => {
              if (!cancelled) {
                setLoading(false);
              }
            },
          });
        } catch (wasmErr) {
          console.warn('SplatMesh WASM init failed, falling back to iframe:', wasmErr);
          if (!cancelled) {
            setWasmFailed(true);
            setLoading(false);
            renderer?.dispose?.();
          }
          return;
        }

        scene.add(splatMesh as unknown as import('three').Object3D);
        // Flip the splat upright — splat files often use Z-up convention
        (splatMesh as unknown as import('three').Object3D).rotation.x = Math.PI;

        // Store internals for capture
        internalsRef.current = { renderer, scene, camera };

        // Simple orbit controls via pointer
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;
        let theta = 0;
        let phi = Math.PI / 6;
        let radius = 3;

        const updateCameraFromOrbit = () => {
          camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
          camera.position.y = radius * Math.sin(phi) + 1;
          camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
          camera.lookAt(0, 0.5, 0);
        };

        const onPointerDown = (e: PointerEvent) => {
          isDragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
        };

        const onPointerMove = (e: PointerEvent) => {
          if (!isDragging) return;
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          theta += dx * 0.005;
          phi = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, phi + dy * 0.005));
          lastX = e.clientX;
          lastY = e.clientY;
          updateCameraFromOrbit();
        };

        const onPointerUp = () => {
          isDragging = false;
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          radius = Math.max(1, Math.min(10, radius + e.deltaY * 0.005));
          updateCameraFromOrbit();
        };

        const canvas = renderer.domElement;
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        // Resize handler
        resizeObserver = new ResizeObserver(() => {
          if (!container) return;
          const w = container.clientWidth;
          const h = container.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        });
        resizeObserver.observe(container!);

        // Render loop
        const animate = () => {
          if (cancelled) return;
          animId = requestAnimationFrame(animate);
          renderer.render(scene, camera);
        };
        animate();
      } catch (err) {
        if (!cancelled) {
          console.warn('SparkJS init failed, falling back:', err);
          setWasmFailed(true);
          setError((err as Error).message ?? 'Failed to load 3D viewer');
          setLoading(false);
        }
      }
    }

    void initSpark();

    return () => {
      cancelled = true;
      internalsRef.current = null;
      if (animId) cancelAnimationFrame(animId);
      resizeObserver?.disconnect();
      renderer?.dispose?.();
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [splatUrl]);

  // If WASM failed and we have a viewerUrl, seamlessly show iframe
  if (wasmFailed && viewerUrl) {
    return (
      <div className={`relative ${className}`}>
        <iframe
          src={viewerUrl}
          title="World Viewer"
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope"
        />
      </div>
    );
  }

  // Fallback: use iframe viewer URL (no splat URL provided)
  if (!splatUrl && viewerUrl) {
    return (
      <div className={`relative ${className}`}>
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <span className="text-sm text-zinc-300">Loading 3D world…</span>
            </div>
          </div>
        )}
        <iframe
          src={viewerUrl}
          title="World Viewer"
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope"
          onLoad={() => setLoading(false)}
          onError={() => {
            setError('Viewer failed to load');
            setLoading(false);
          }}
        />
      </div>
    );
  }

  // Fallback: static image
  if (!splatUrl && !viewerUrl) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        {fallbackImageUrl ? (
          <img
            src={fallbackImageUrl}
            alt={displayName ?? 'World'}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex items-center gap-2">
            <Globe2 className="h-10 w-10 text-zinc-700" />
            <span className="text-sm text-zinc-500">No viewer available</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            <span className="text-sm text-zinc-300">Loading 3D world…</span>
          </div>
        </div>
      )}

      {/* Error state - fall back to iframe or image */}
      {error && !wasmFailed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80">
          <AlertCircle className="h-6 w-6 text-amber-400" />
          <p className="text-sm text-zinc-400">SparkJS renderer unavailable</p>
          {viewerUrl ? (
            <a
              href={viewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
            >
              Open in Marble ↗
            </a>
          ) : fallbackImageUrl ? (
            <img
              src={fallbackImageUrl}
              alt={displayName ?? 'World'}
              className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30"
            />
          ) : null}
        </div>
      )}

      {/* SparkJS canvas container */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
});
