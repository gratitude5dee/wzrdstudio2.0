// Single HTMLAudioElement controller used by all wizard panels.
// Drives playback against a clip window [loop.start, loop.end] and exposes
// clip-relative time updated on every animation frame for smooth UI.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export interface AudioEngine {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number; // clip-relative seconds (0..duration)
  duration: number; // clip duration in seconds
  load: (url: string | null) => void;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  seek: (clipRelativeSec: number) => void;
  /**
   * Configure the playback window. When `loop` is true (default) playback
   * wraps from `endSec` back to `startSec` continuously; when false it
   * pauses at `endSec`.
   */
  setLoop: (startSec: number, endSec: number, opts?: { loop?: boolean }) => void;
}

export function useAudioEngine(): AudioEngine {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loopRef = useRef({ start: 0, end: 0, loop: true });
  const rafRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Lazily create the audio element. Do NOT set crossOrigin here — it's
  // applied per-load (only for remote http(s) URLs). Setting crossOrigin
  // on blob: URLs causes silent load failures in Chromium.
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const loop = loopRef.current;
    const t = a.currentTime;

    if (loop.end > loop.start && t >= loop.end) {
      if (loop.loop) {
        a.currentTime = loop.start;
        setCurrentTime(0);
      } else {
        a.pause();
        a.currentTime = loop.start;
        setCurrentTime(0);
        return; // pause handler will stop RAF
      }
    } else {
      setCurrentTime(Math.max(0, t - loop.start));
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onLoaded = () => setIsReady(true);
    const onPlay = () => {
      setIsPlaying(true);
      stopRaf();
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setIsPlaying(false);
      stopRaf();
    };
    const onEnded = () => {
      setIsPlaying(false);
      stopRaf();
      const loop = loopRef.current;
      if (loop.end > loop.start) {
        a.currentTime = loop.start;
        setCurrentTime(0);
      }
    };
    const onError = () => {
      const code = a.error?.code;
      const msg = a.error?.message;
      console.error('[audio] media error', { code, msg, src: a.currentSrc });
      setIsReady(false);
      setIsPlaying(false);
      stopRaf();
      toast.error(`Audio playback failed${code ? ` (code ${code})` : ''}`);
    };

    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('canplay', onLoaded);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);

    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('canplay', onLoaded);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
      stopRaf();
    };
  }, [tick, stopRaf]);

  const load = useCallback((url: string | null) => {
    const a = audioRef.current;
    if (!a) return;
    stopRaf();
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    // Always clear crossOrigin — we don't need CORS for plain <audio>
    // playback, and setting it makes Supabase public URLs fail when the
    // bucket doesn't return CORS headers for the credentialed request.
    a.removeAttribute('crossorigin');
    if (!url) {
      a.pause();
      a.removeAttribute('src');
      a.load();
      return;
    }
    a.src = url;
    a.load();
  }, [stopRaf]);

  const play = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    const loop = loopRef.current;
    if (loop.end > loop.start) {
      if (a.currentTime < loop.start || a.currentTime >= loop.end) {
        a.currentTime = loop.start;
      }
    }
    try {
      await a.play();
    } catch (e) {
      console.warn('[audio] play rejected', e);
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) await play();
    else a.pause();
  }, [play]);

  const seek = useCallback((clipRelativeSec: number) => {
    const a = audioRef.current;
    if (!a) return;
    const loop = loopRef.current;
    const clipDur = Math.max(0, loop.end - loop.start);
    const clamped = Math.max(0, Math.min(clipDur, clipRelativeSec));
    a.currentTime = loop.start + clamped;
    setCurrentTime(clamped);
  }, []);

  const setLoop = useCallback((startSec: number, endSec: number, opts?: { loop?: boolean }) => {
    const loop = opts?.loop ?? true;
    const start = Math.max(0, startSec);
    const end = Math.max(start, endSec);
    loopRef.current = { start, end, loop };
    setDuration(Math.max(0, end - start));
    const a = audioRef.current;
    if (a && (a.currentTime < start || a.currentTime >= end)) {
      a.currentTime = start;
      setCurrentTime(0);
    }
  }, []);

  return { isReady, isPlaying, currentTime, duration, load, play, pause, toggle, seek, setLoop };
}
