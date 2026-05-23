import type { Clip, Keyframe } from '@/store/videoEditorStore';

export type RemoteRenderFeature = 'transform' | 'transition' | 'effect' | 'keyframe';

export interface RemoteRenderWarning {
  clipId: string;
  clipName: string;
  features: RemoteRenderFeature[];
  reason: string;
}

const hasMaterialTransform = (clip: Clip) => {
  const transforms = clip.transforms;
  return (
    transforms.position.x !== 0 ||
    transforms.position.y !== 0 ||
    transforms.scale.x !== 1 ||
    transforms.scale.y !== 1 ||
    transforms.rotation !== 0 ||
    transforms.opacity !== 1
  );
};

export const isRemoteFetchableMediaUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export function collectRemoteRenderWarnings(clips: Clip[], keyframes: Keyframe[]): RemoteRenderWarning[] {
  const keyframedClipIds = new Set(keyframes.map((keyframe) => keyframe.targetId));

  return clips.flatMap((clip) => {
    const features: RemoteRenderFeature[] = [];
    if (hasMaterialTransform(clip)) features.push('transform');
    if (clip.transition && clip.transition.type !== 'none') features.push('transition');
    if (clip.effects && clip.effects.length > 0) features.push('effect');
    if (keyframedClipIds.has(clip.id)) features.push('keyframe');

    if (features.length === 0) {
      return [];
    }

    return [
      {
        clipId: clip.id,
        clipName: clip.name,
        features,
        reason: 'Director\'s Cut remote rendering applies timing, trims, and audio; styled clip rendering requires the Remotion/FFmpeg renderer.',
      },
    ];
  });
}
