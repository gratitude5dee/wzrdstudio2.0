import type { SVGProps } from 'react';

/**
 * Compact iconographic glyphs for the Lens Combo carousel.
 * All glyphs use `currentColor` so the active orange tint propagates from the parent.
 * Each glyph accepts an optional `active` flag so it can render a slightly bolder,
 * "engraved" version when displayed in the highlighted center cell.
 */

const baseProps: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 64 64',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
};

interface GlyphProps {
  className?: string;
  active?: boolean;
}

/** Camera body silhouette — accent stripe varies subtly per body, but shape is shared. */
export function CameraGlyph({
  name,
  className,
  active,
}: GlyphProps & { name?: string }) {
  const isFilm = name?.includes('Film');
  const isPhantom = name === 'Phantom Flex';
  const isDigital = name === 'Digital';
  const sw = active ? 1.8 : 1.6;

  return (
    <svg {...baseProps} className={className}>
      {isFilm ? (
        <>
          <circle cx="22" cy="14" r="6" stroke="currentColor" strokeWidth={sw - 0.1} opacity="0.55" />
          <circle cx="22" cy="14" r="2" fill="currentColor" opacity="0.55" />
        </>
      ) : !isDigital ? (
        <rect x="20" y="14" width="14" height="6" rx="1.5" stroke="currentColor" strokeWidth={sw - 0.2} opacity="0.6" />
      ) : null}

      {/* Body */}
      <rect x="8" y="20" width="48" height="28" rx="3" stroke="currentColor" strokeWidth={sw} />

      {/* Lens barrel */}
      <circle cx="32" cy="34" r={isPhantom ? 11 : 9} stroke="currentColor" strokeWidth={sw} />
      <circle cx="32" cy="34" r={isPhantom ? 7 : 5.5} stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <circle cx="32" cy="34" r="2" fill="currentColor" opacity={active ? 1 : 0.85} />

      {/* Viewfinder dot */}
      <circle cx="50" cy="26" r="1.4" fill="currentColor" opacity="0.7" />
      <rect x="10" y="44" width="8" height="2" rx="1" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

/** Lens family — concentric barrel rings; anamorphic stretches oval, macro adds magnifier dot. */
export function LensGlyph({
  name,
  className,
  active,
}: GlyphProps & { name?: string }) {
  const isAnamorphic = name === 'Anamorphic';
  const isMacro = name === 'Macro';
  const isVintage = name === 'Vintage Glass';
  const sw = active ? 1.8 : 1.6;

  return (
    <svg {...baseProps} className={className}>
      <ellipse
        cx="32"
        cy="32"
        rx={isAnamorphic ? 22 : 18}
        ry="18"
        stroke="currentColor"
        strokeWidth={sw}
      />
      <ellipse
        cx="32"
        cy="32"
        rx={isAnamorphic ? 16 : 13}
        ry="13"
        stroke="currentColor"
        strokeWidth={sw - 0.4}
        opacity="0.75"
      />
      <ellipse
        cx="32"
        cy="32"
        rx={isAnamorphic ? 10 : 8}
        ry="8"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.6"
      />
      <circle cx="32" cy="32" r="3" fill="currentColor" opacity={isVintage ? 0.6 : 0.9} />

      {isAnamorphic ? (
        <line x1="6" y1="32" x2="58" y2="32" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
      ) : null}

      {isMacro ? (
        <circle cx="46" cy="20" r="3.5" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
      ) : null}
    </svg>
  );
}

/** Focal length — large numeral with an angle-of-view arc behind it (active only). */
export function FocalGlyph({
  value,
  className,
  active,
}: GlyphProps & { value?: string }) {
  const mm = value ? parseInt(value, 10) || 35 : 35;
  // Map focal length to half-angle of view (roughly): 14mm ≈ 55°, 135mm ≈ 9°
  const halfAngle = Math.max(8, Math.min(60, 800 / mm));
  const rad = (halfAngle * Math.PI) / 180;
  const r = 26;
  const cx = 32;
  const cy = 50;
  const x1 = cx - r * Math.sin(rad);
  const y1 = cy - r * Math.cos(rad);
  const x2 = cx + r * Math.sin(rad);
  const y2 = cy - r * Math.cos(rad);

  return (
    <svg {...baseProps} className={className}>
      {/* Angle-of-view fan — active only, keeps peeks calm */}
      {active ? (
        <path
          d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
          fill="currentColor"
          fillOpacity="0.06"
          opacity="0.7"
        />
      ) : null}
      {active ? <circle cx={cx} cy={cy} r="1.6" fill="currentColor" opacity="0.7" /> : null}
      <text
        x="32"
        y={active ? 30 : 34}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fontWeight="700"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        letterSpacing="-0.6"
      >
        {value ?? '—'}
      </text>
    </svg>
  );
}

/** Aperture — iris diagram with opening that scales to f-stop. */
export function ApertureGlyph({
  value,
  className,
  active,
}: GlyphProps & { value?: string }) {
  const fNum = value ? parseFloat(value.replace('f/', '')) || 4 : 4;
  // Larger f-number = smaller opening. Map f/1.4 → r=10, f/8 → r=2.
  const openingR = Math.max(2, 12 - fNum * 1.2);
  const bladeStroke = active ? 1.6 : 1.3;

  // Six iris blades
  const blades = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const outerR = 22;
    const x1 = 32 + Math.cos(angle) * outerR;
    const y1 = 32 + Math.sin(angle) * outerR;
    const tangentAngle = angle + Math.PI / 3;
    const x2 = 32 + Math.cos(tangentAngle) * openingR * 1.1;
    const y2 = 32 + Math.sin(tangentAngle) * openingR * 1.1;
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={bladeStroke}
        opacity="0.75"
      />
    );
  });

  return (
    <svg {...baseProps} className={className}>
      {/* Outer iris ring */}
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth={active ? 1.7 : 1.5} opacity="0.9" />
      {/* Inner housing ring (subtle) */}
      <circle cx="32" cy="32" r="14" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
      {/* Blades */}
      {blades}
      {/* Opening */}
      <circle cx="32" cy="32" r={openingR} fill="currentColor" opacity={active ? 0.95 : 0.85} />
    </svg>
  );
}
