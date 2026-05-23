import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Fullscreen background video component with dark overlay and fallback.
 * Plays bgvid.mp4 muted, looping, autoplaying with playsInline.
 * Shows a dark gradient fallback while video loads or if it fails.
 */
export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => setIsVideoLoaded(true);
    const handleError = () => setHasVideoError(true);

    video.addEventListener('canplaythrough', handleCanPlay);
    video.addEventListener('error', handleError);

    // If the video is already loaded (cached), fire immediately
    if (video.readyState >= 4) {
      setIsVideoLoaded(true);
    }

    return () => {
      video.removeEventListener('canplaythrough', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0">
      {/* Fallback gradient — always present, fades when video loads */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #0a0a0a 0%, #111111 25%, #0d0d0d 50%, #141414 75%, #0a0a0a 100%)',
        }}
      />

      {/* Video element */}
      {!hasVideoError && (
        <AnimatePresence>
          <motion.video
            ref={videoRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: isVideoLoaded ? 1 : 0 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            src="/bgvid.mp4"
            aria-hidden="true"
          />
        </AnimatePresence>
      )}

      {/* Dark overlay for text legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Subtle noise texture for depth */}
      <div
        className="absolute inset-0 opacity-[0.02] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
        }}
      />
    </div>
  );
}

export default VideoBackground;
