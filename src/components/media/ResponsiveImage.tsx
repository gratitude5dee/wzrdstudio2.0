import { memo, useState, type ImgHTMLAttributes } from 'react';

interface ResponsiveImageSource {
  type: string;
  srcSet?: string;
  src?: string;
}

interface ResponsiveImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  sources?: ResponsiveImageSource[];
  placeholder?: string;
  alt: string;
  width?: number;
  height?: number;
}

/**
 * Renders a <picture> element with modern format sources (AVIF, WebP)
 * and a fallback <img>. Supports blur-up placeholder.
 */
export const ResponsiveImage = memo(({
  src,
  sources = [],
  placeholder,
  alt,
  width,
  height,
  className,
  loading = 'lazy',
  ...rest
}: ResponsiveImageProps) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative" style={{ width, height }}>
      {placeholder && !loaded && (
        <div
          className="absolute inset-0 rounded-md"
          style={{
            backgroundImage: placeholder,
            backgroundSize: 'cover',
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
          aria-hidden
        />
      )}
      <picture>
        {sources.map((s, i) => (
          <source key={i} type={s.type} srcSet={s.srcSet || s.src} />
        ))}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          className={className}
          onLoad={() => setLoaded(true)}
          {...rest}
        />
      </picture>
    </div>
  );
});

ResponsiveImage.displayName = 'ResponsiveImage';

export default ResponsiveImage;
