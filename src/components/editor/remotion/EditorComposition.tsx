import { CSSProperties, useMemo } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, Video, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { AudioTrack, Clip, ClipTransition, CompositionSettings, Keyframe } from '@/store/videoEditorStore';

interface EditorCompositionProps {
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
  selectedClipIds?: string[];
  keyframes: Keyframe[];
}

const msToFrames = (ms: number, fps: number) => Math.max(1, Math.round((ms / 1000) * fps));
const msToStartFrame = (ms: number, fps: number) => Math.max(0, Math.floor((ms / 1000) * fps));

export function EditorComposition({ clips, audioTracks, composition, selectedClipIds = [], keyframes }: EditorCompositionProps) {
  const fps = composition.fps;
  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0)),
    [clips]
  );
  const sortedAudio = useMemo(
    () => [...audioTracks].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0)),
    [audioTracks]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: composition.backgroundColor }}>
      {sortedClips.map((clip, index) => {
        const from = msToStartFrame(clip.startTime ?? 0, fps);
        const duration = msToFrames(clip.duration ?? 1000, fps);

        return (
          <Sequence key={clip.id} from={from} durationInFrames={duration}>
            <ClipLayer
              clip={clip}
              clipIndex={index}
              keyframes={keyframes.filter((kf) => kf.targetId === clip.id)}
              isSelected={selectedClipIds.includes(clip.id)}
              fps={fps}
              durationInFrames={duration}
            />
          </Sequence>
        );
      })}

      {sortedAudio.map((track) => {
        const from = msToStartFrame(track.startTime ?? 0, fps);
        const duration = msToFrames(track.duration ?? 1000, fps);
        const fadeInFrames = msToFrames(track.fadeInDuration ?? 0, fps);
        const fadeOutFrames = msToFrames(track.fadeOutDuration ?? 0, fps);
        return (
          <Sequence key={track.id} from={from} durationInFrames={duration}>
            <Audio
              src={track.url}
              volume={(frame) => {
                if (track.isMuted) return 0;
                const localFrame = frame;
                let volume = track.volume ?? 1;
                if (fadeInFrames > 0 && localFrame < fadeInFrames) {
                  volume *= localFrame / fadeInFrames;
                }
                if (fadeOutFrames > 0) {
                  const remaining = duration - localFrame;
                  if (remaining < fadeOutFrames) {
                    volume *= Math.max(0, remaining / fadeOutFrames);
                  }
                }
                return volume;
              }}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

interface ClipLayerProps {
  clip: Clip;
  clipIndex: number;
  keyframes: Keyframe[];
  isSelected: boolean;
  fps: number;
  durationInFrames: number;
}

/**
 * Compute the transition opacity/transform for a clip's entry transition.
 * Supports fade, dissolve, wipe, slide, zoom, and blur transitions.
 */
function getTransitionStyle(
  frame: number,
  durationInFrames: number,
  transition: ClipTransition | undefined,
  fps: number
): CSSProperties {
  if (!transition || transition.type === 'none') return {};

  const transitionFrames = msToFrames(transition.duration, fps);
  if (transitionFrames <= 0) return {};

  // Clamp transition to not exceed clip duration
  const effectiveTransitionFrames = Math.min(transitionFrames, durationInFrames);

  // Fade-in progress: 0 at start → 1 when transition ends
  const progress = interpolate(
    frame,
    [0, effectiveTransitionFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  switch (transition.type) {
    case 'fade':
      return { opacity: progress };
    case 'dissolve':
      // Dissolve is similar to fade but with a slight scale shift for dissolve feel
      return {
        opacity: progress,
        filter: `blur(${interpolate(progress, [0, 1], [2, 0])}px)`,
      };
    case 'wipe': {
      const dir = transition.direction ?? 'left';
      const clipPath =
        dir === 'left'
          ? `inset(0 ${interpolate(progress, [0, 1], [100, 0])}% 0 0)`
          : dir === 'right'
          ? `inset(0 0 0 ${interpolate(progress, [0, 1], [100, 0])}%)`
          : dir === 'up'
          ? `inset(0 0 ${interpolate(progress, [0, 1], [100, 0])}% 0)`
          : `inset(${interpolate(progress, [0, 1], [100, 0])}% 0 0 0)`;
      return { clipPath };
    }
    case 'slide': {
      const dir = transition.direction ?? 'left';
      const offset = interpolate(progress, [0, 1], [100, 0]);
      const tx = dir === 'left' ? -offset : dir === 'right' ? offset : 0;
      const ty = dir === 'up' ? -offset : dir === 'down' ? offset : 0;
      return { transform: `translate(${tx}%, ${ty}%)` };
    }
    case 'zoom':
      return {
        opacity: progress,
        transform: `scale(${interpolate(progress, [0, 1], [0.5, 1])})`,
      };
    case 'blur':
      return {
        opacity: progress,
        filter: `blur(${interpolate(progress, [0, 1], [20, 0])}px)`,
      };
    default:
      return {};
  }
}

const ClipLayer = ({ clip, keyframes, isSelected, fps, durationInFrames }: ClipLayerProps) => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const absoluteTimeMs = (frame / config.fps) * 1000 + (clip.startTime ?? 0);
  const transform = getTransformForTime(clip, keyframes, absoluteTimeMs);

  // Compute transition styles for clip entry
  const transitionStyles = getTransitionStyle(frame, durationInFrames, clip.transition, fps);

  // Base opacity from transforms (modulated by transition)
  const baseOpacity = transform.opacity;
  const transitionOpacity = transitionStyles.opacity !== undefined ? (transitionStyles.opacity as number) : 1;
  const finalOpacity = baseOpacity * transitionOpacity;

  const baseTransform = `translate(${transform.position.x}px, ${transform.position.y}px) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`;
  const transitionTransform = transitionStyles.transform ? ` ${transitionStyles.transform}` : '';

  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `${baseTransform}${transitionTransform}`,
    opacity: finalOpacity,
    filter: transitionStyles.filter,
    clipPath: transitionStyles.clipPath,
    boxShadow: isSelected ? '0 0 0 3px rgba(155,135,245,0.8)' : 'none',
    transition: 'box-shadow 0.2s ease-in-out',
  };

  return clip.type === 'video' ? <Video src={clip.url} style={style} /> : <Img src={clip.url} style={style} />;
};

const getTransformForTime = (clip: Clip, keyframes: Keyframe[], time: number) => {
  if (keyframes.length === 0) {
    return clip.transforms;
  }
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const previous = [...sorted].reverse().find((kf) => kf.time <= time);
  const next = sorted.find((kf) => kf.time >= time && kf !== previous);
  const prevTransform = (previous?.properties.transforms as Clip['transforms']) ?? clip.transforms;
  const nextTransform = (next?.properties.transforms as Clip['transforms']) ?? prevTransform;
  if (!next) {
    return prevTransform;
  }
  const range = Math.max(1, next.time - (previous?.time ?? 0));
  const progress = Math.max(0, Math.min(1, (time - (previous?.time ?? 0)) / range));
  const lerp = (start: number, end: number) => start + (end - start) * progress;
  return {
    position: {
      x: lerp(prevTransform.position.x, nextTransform.position.x),
      y: lerp(prevTransform.position.y, nextTransform.position.y),
    },
    scale: {
      x: lerp(prevTransform.scale.x, nextTransform.scale.x),
      y: lerp(prevTransform.scale.y, nextTransform.scale.y),
    },
    rotation: lerp(prevTransform.rotation, nextTransform.rotation),
    opacity: lerp(prevTransform.opacity, nextTransform.opacity),
  };
};
