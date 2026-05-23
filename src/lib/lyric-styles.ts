export type LyricStyleId =
  | 'default'
  | 'none'
  | 'heartless'
  | 'fly'
  | 'pikachu'
  | 'wave'
  | 'hotpink'
  | 'brat';

export interface LyricStyle {
  id: LyricStyleId;
  name: string;
  font: string;
  fill: string;
  accentFill?: string;
  accentTarget?: 'first-word';
  stroke?: string;
  strokeWidth?: number;
  shadow?: string;
  animationIn: 'pop' | 'rise' | 'tilt' | 'none';
  transform?: string;
  background?: string;
  tracking?: string;
}

export const LYRIC_STYLES: LyricStyle[] = [
  {
    id: 'default',
    name: 'Default',
    font: 'Inter, system-ui, sans-serif',
    fill: '#E8FBFF',
    accentFill: '#54D9FF',
    accentTarget: 'first-word',
    stroke: '#071014',
    strokeWidth: 10,
    shadow: '0 0 26px rgba(84,217,255,0.42)',
    animationIn: 'pop',
  },
  {
    id: 'none',
    name: 'None',
    font: 'Inter, system-ui, sans-serif',
    fill: 'transparent',
    animationIn: 'none',
  },
  {
    id: 'heartless',
    name: 'Heartless',
    font: 'Georgia, Times New Roman, serif',
    fill: '#FFD400',
    stroke: '#050505',
    strokeWidth: 12,
    shadow: '0 0 32px rgba(255,212,0,0.55)',
    animationIn: 'tilt',
    transform: 'skewX(-8deg)',
    tracking: '0.04em',
  },
  {
    id: 'fly',
    name: 'Fly',
    font: 'Impact, Arial Narrow, sans-serif',
    fill: '#FFFFFF',
    stroke: '#050505',
    strokeWidth: 9,
    shadow: '0 8px 26px rgba(0,0,0,0.65)',
    animationIn: 'rise',
    tracking: '0.12em',
  },
  {
    id: 'pikachu',
    name: 'Pikachu',
    font: 'Inter, system-ui, sans-serif',
    fill: '#FFFFFF',
    accentFill: '#FFD400',
    accentTarget: 'first-word',
    stroke: '#050505',
    strokeWidth: 10,
    shadow: '0 0 28px rgba(255,212,0,0.45)',
    animationIn: 'pop',
  },
  {
    id: 'wave',
    name: 'Wave',
    font: 'Inter, system-ui, sans-serif',
    fill: '#FFFFFF',
    accentFill: '#42D9FF',
    accentTarget: 'first-word',
    stroke: '#061014',
    strokeWidth: 10,
    shadow: '0 0 30px rgba(66,217,255,0.5)',
    animationIn: 'rise',
  },
  {
    id: 'hotpink',
    name: 'Hotpink',
    font: 'Arial Black, Inter, system-ui, sans-serif',
    fill: '#FF3D81',
    stroke: '#050505',
    strokeWidth: 9,
    shadow: '0 0 30px rgba(255,61,129,0.58)',
    animationIn: 'tilt',
    transform: 'rotate(-2deg)',
  },
  {
    id: 'brat',
    name: 'Brat',
    font: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fill: '#050505',
    stroke: '#B7FF31',
    strokeWidth: 8,
    shadow: '0 0 26px rgba(183,255,49,0.36)',
    animationIn: 'none',
    background: '#B7FF31',
    tracking: '0.02em',
  },
];

export function getLyricStyle(styleId?: string | null): LyricStyle {
  return LYRIC_STYLES.find((style) => style.id === styleId) ?? LYRIC_STYLES[0];
}

export function isLyricStyleId(value: string): value is LyricStyleId {
  return LYRIC_STYLES.some((style) => style.id === value);
}
