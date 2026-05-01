// Single HTMLAudioElement controller used by all 3 wizard panels.
// Exposes clip-relative time/duration; loops within [loopStart, loopEnd].

import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Lazily create the audio element
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => {
      const loop = loopRef.current;
      const t = a.currentTime;
      // Loop guard
      if (loop.end > loop.start && t >= loop.end) {
        a.currentTime = loop.start;
        if (!a.paused) {
          a.pause();
          setIsPlaying(false);
        }
        setCurrentTime(0);
        return;
      }
      setCurrentTime(Math.max(0, t - loop.start));
    };
    const onLoaded = () => {
      setIsReady(true);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      const loop = loopRef.current;
      if (loop.end > loop.start) {
        a.currentTime = loop.start;
        setCurrentTime(0);
      }
    };

    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('canplay', onLoaded);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);

    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('canplay', onLoaded);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  const load = useCallback((url: string | null) => {
    const a = audioRef.current;
    if (!a) return;
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    if (!url) {
      a.removeAttribute('src');
      a.load();
      return;
    }
    a.src = url;
    a.load();
  }, []);

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
    const t = loop.start + Math.max(0, clipRelativeSec);
    a.currentTime = t;
    setCurrentTime(Math.max(0, t - loop.start));
  }, []);

  const setLoop = useCallback((startSec: number, endSec: number) => {
    loopRef.current = { start: Math.max(0, startSec), end: Math.max(startSec, endSec) };
    setDuration(Math.max(0, endSec - startSec));
    const a = audioRef.current;
    if (a && (a.currentTime < startSec || a.currentTime >= endSec)) {
      a.currentTime = startSec;
      setCurrentTime(0);
    }
  }, []);

  return { isReady, isPlaying, currentTime, duration, load, play, pause, toggle, seek, setLoop };
}
