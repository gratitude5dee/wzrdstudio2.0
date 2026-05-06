import { memo, type VideoHTMLAttributes } from 'react';

interface SmartVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'poster'> {
  poster?: string;
  sources: Array<{ type: string; src: string }>;
  className?: string;
}

/**
 * Renders a <video> element with multiple sources and an optional poster.
 * Defaults to autoplay, muted, loop, playsInline for hero/background use.
 */
export const SmartVideo = memo(({
  poster,
  sources,
  className,
  autoPlay = true,
  muted = true,
  loop = true,
  playsInline = true,
  ...rest
}: SmartVideoProps) => {
  return (
    <video
      className={className}
      poster={poster}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      playsInline={playsInline}
      preload="metadata"
      {...rest}
    >
      {sources.map((s) => (
        <source key={s.type} src={s.src} type={s.type} />
      ))}
    </video>
  );
});

SmartVideo.displayName = 'SmartVideo';

export default SmartVideo;
