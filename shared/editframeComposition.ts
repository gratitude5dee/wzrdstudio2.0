export type EditframeAssetType = 'image' | 'video' | 'audio' | 'text' | 'element';

export interface EditframeEffect {
  id?: string;
  name?: string;
  type?: 'filter' | 'adjustment' | 'overlay' | string;
  params?: Record<string, number>;
}

export interface EditframeTransition {
  type?: 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'blur' | 'none' | string;
  duration?: number;
  direction?: 'left' | 'right' | 'up' | 'down' | string;
}

export interface EditframeCompositionAsset {
  id: string;
  type: EditframeAssetType;
  url?: string | null;
  name?: string;
  text?: string;
  durationMs?: number | null;
  orderIndex?: number;
  startMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  layer?: number;
  trackIndex?: number;
  volume?: number;
  muted?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  role?: string;
  transition?: EditframeTransition | null;
  effects?: EditframeEffect[] | null;
  style?: Record<string, unknown> | null;
  transforms?: {
    position?: { x?: number; y?: number };
    scale?: { x?: number; y?: number };
    rotation?: number;
    opacity?: number;
  };
  metadata?: Record<string, unknown> | null;
}

export interface EditframeCompositionOptions {
  width?: number;
  height?: number;
  fps?: number;
  backgroundColor?: string;
  compositionId?: string;
  durationMs?: number;
}

export interface EditframeCompositionResult {
  html: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;
const DEFAULT_IMAGE_DURATION_MS = 5000;
const DEFAULT_VIDEO_DURATION_MS = 6000;
const DEFAULT_TEXT_DURATION_MS = 5000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function metadataNumber(asset: EditframeCompositionAsset, key: string): number | undefined {
  const value = asset.metadata?.[key];
  return isFiniteNumber(value) ? value : undefined;
}

function metadataString(asset: EditframeCompositionAsset, key: string): string | undefined {
  const value = asset.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function metadataObject<T>(asset: EditframeCompositionAsset, key: string): T | undefined {
  const value = asset.metadata?.[key];
  return value && typeof value === 'object' ? (value as T) : undefined;
}

function metadataArray<T>(asset: EditframeCompositionAsset, key: string): T[] | undefined {
  const value = asset.metadata?.[key];
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function seconds(ms: number): string {
  return `${Math.max(0, ms) / 1000}s`;
}

function assetStartMs(asset: EditframeCompositionAsset, fallback = 0): number {
  return (
    asset.startMs ??
    metadataNumber(asset, 'start_ms') ??
    metadataNumber(asset, 'startTime') ??
    metadataNumber(asset, 'startTimeMs') ??
    fallback
  );
}

function assetDurationMs(asset: EditframeCompositionAsset): number {
  return (
    asset.durationMs ??
    metadataNumber(asset, 'duration_ms') ??
    metadataNumber(asset, 'durationMs') ??
    (asset.type === 'image'
      ? DEFAULT_IMAGE_DURATION_MS
      : asset.type === 'text' || asset.type === 'element'
        ? DEFAULT_TEXT_DURATION_MS
        : DEFAULT_VIDEO_DURATION_MS)
  );
}

function assetTrimStartMs(asset: EditframeCompositionAsset): number | undefined {
  return asset.trimStartMs ?? metadataNumber(asset, 'trimStartMs') ?? metadataNumber(asset, 'trim_start_ms');
}

function assetTrimEndMs(asset: EditframeCompositionAsset): number | undefined {
  return asset.trimEndMs ?? metadataNumber(asset, 'trimEndMs') ?? metadataNumber(asset, 'trim_end_ms');
}

function assetFadeInMs(asset: EditframeCompositionAsset): number | undefined {
  return asset.fadeInMs ?? metadataNumber(asset, 'fadeInMs') ?? metadataNumber(asset, 'fadeInDuration') ?? metadataNumber(asset, 'fade_in_ms');
}

function assetFadeOutMs(asset: EditframeCompositionAsset): number | undefined {
  return asset.fadeOutMs ?? metadataNumber(asset, 'fadeOutMs') ?? metadataNumber(asset, 'fadeOutDuration') ?? metadataNumber(asset, 'fade_out_ms');
}

function assetLayer(asset: EditframeCompositionAsset): number {
  return asset.layer ?? metadataNumber(asset, 'layer') ?? metadataNumber(asset, 'layer_index') ?? 0;
}

function assetRole(asset: EditframeCompositionAsset): string {
  return asset.role ?? metadataString(asset, 'asset_role') ?? metadataString(asset, 'role') ?? asset.type;
}

function assetText(asset: EditframeCompositionAsset): string {
  return asset.text ?? metadataString(asset, 'text') ?? metadataString(asset, 'text_content') ?? asset.name ?? 'Text';
}

function assetStyle(asset: EditframeCompositionAsset): Record<string, unknown> {
  return asset.style ?? metadataObject<Record<string, unknown>>(asset, 'style') ?? {};
}

function assetEffects(asset: EditframeCompositionAsset): EditframeEffect[] {
  return asset.effects ?? metadataArray<EditframeEffect>(asset, 'effects') ?? [];
}

function assetTransition(asset: EditframeCompositionAsset): EditframeTransition {
  return asset.transition ?? metadataObject<EditframeTransition>(asset, 'transition') ?? { type: 'none', duration: 0 };
}

function transformStyle(asset: EditframeCompositionAsset): string {
  const transforms = asset.transforms ?? metadataObject<EditframeCompositionAsset['transforms']>(asset, 'transforms');
  const position = transforms?.position ?? {};
  const scale = transforms?.scale ?? {};
  const translateX = isFiniteNumber(position.x) ? position.x : 0;
  const translateY = isFiniteNumber(position.y) ? position.y : 0;
  const scaleX = isFiniteNumber(scale.x) ? scale.x : 1;
  const scaleY = isFiniteNumber(scale.y) ? scale.y : 1;
  const rotation = isFiniteNumber(transforms?.rotation) ? transforms.rotation : 0;
  const opacity = isFiniteNumber(transforms?.opacity) ? transforms.opacity : 1;

  return [
    `transform: translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg);`,
    'transform-origin: center center;',
    `opacity: ${clamp(opacity, 0, 1)};`,
  ].join(' ');
}

function effectStyle(asset: EditframeCompositionAsset): string {
  const effects = assetEffects(asset);
  if (effects.length === 0) return '';

  const filters: string[] = [];
  let boxShadow = '';

  for (const effect of effects) {
    const id = effect.id ?? effect.name?.toLowerCase().replace(/\s+/g, '-') ?? '';
    const params = effect.params ?? {};
    const value = isFiniteNumber(params.value) ? params.value : undefined;
    const amount = isFiniteNumber(params.amount) ? params.amount : undefined;

    if (id === 'brightness' && value !== undefined) filters.push(`brightness(${clamp(value, 0, 300)}%)`);
    if (id === 'contrast' && value !== undefined) filters.push(`contrast(${clamp(value, 0, 300)}%)`);
    if (id === 'saturation' && value !== undefined) filters.push(`saturate(${clamp(value, 0, 300)}%)`);
    if (id === 'exposure' && value !== undefined) filters.push(`brightness(${clamp(100 + value, 0, 300)}%)`);
    if (id === 'blur' && isFiniteNumber(params.radius)) filters.push(`blur(${clamp(params.radius, 0, 80)}px)`);
    if (id === 'grayscale') filters.push(`grayscale(${clamp(amount ?? value ?? 100, 0, 100)}%)`);
    if (id === 'sepia') filters.push(`sepia(${clamp(amount ?? value ?? 100, 0, 100)}%)`);
    if (id === 'invert') filters.push(`invert(${clamp(amount ?? value ?? 100, 0, 100)}%)`);
    if (id === 'vignette') {
      const intensity = clamp(amount ?? value ?? 35, 0, 100) / 100;
      boxShadow = `box-shadow: inset 0 0 ${Math.round(220 * intensity)}px rgba(0,0,0,${clamp(intensity, 0, 0.9)});`;
    }
  }

  return [
    filters.length > 0 ? `filter: ${filters.join(' ')};` : '',
    boxShadow,
  ].filter(Boolean).join(' ');
}

function transitionClass(asset: EditframeCompositionAsset): string {
  const transition = assetTransition(asset);
  const type = transition.type ?? 'none';
  if (type === 'none' || !type) return '';
  const direction = transition.direction ? `-${transition.direction}` : '';
  return `wzrd-transition wzrd-transition-${type}${direction}`;
}

function transitionStyle(asset: EditframeCompositionAsset): string {
  const transition = assetTransition(asset);
  const duration = clamp(transition.duration ?? 0, 0, assetDurationMs(asset));
  if (!transition.type || transition.type === 'none' || duration <= 0) return '';
  return `--wzrd-transition-duration:${duration}ms;`;
}

function textStyle(asset: EditframeCompositionAsset): string {
  const style = assetStyle(asset);
  const fontFamily = typeof style.fontFamily === 'string' ? style.fontFamily : 'Inter, sans-serif';
  const fontSize = isFiniteNumber(style.fontSize) ? style.fontSize : 48;
  const fontWeight = typeof style.fontWeight === 'string' ? style.fontWeight : '700';
  const color = typeof style.color === 'string' ? style.color : '#ffffff';
  const background = typeof style.backgroundColor === 'string' ? style.backgroundColor : 'transparent';
  const textAlign = typeof style.textAlign === 'string' ? style.textAlign : 'center';

  return [
    transformStyle(asset),
    `font-family:"${escapeCssString(fontFamily)}";`,
    `font-size:${clamp(fontSize, 8, 260)}px;`,
    `font-weight:${escapeCssString(fontWeight)};`,
    `color:${escapeCssString(color)};`,
    `background:${escapeCssString(background)};`,
    `text-align:${escapeCssString(textAlign)};`,
    'line-height:1.08;',
    'padding:0.25em 0.35em;',
    'max-width:90%;',
    effectStyle(asset),
  ].filter(Boolean).join(' ');
}

function buildMediaElement(asset: EditframeCompositionAsset, durationMs: number): string {
  const style = [transformStyle(asset), effectStyle(asset)].filter(Boolean).join(' ');
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : '';

  if (asset.type === 'text') {
    return `<ef-text duration="${seconds(durationMs)}" split="word" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 wzrd-text"${` style="${escapeAttr(textStyle(asset))}"`}>${escapeHtml(assetText(asset))}</ef-text>`;
  }

  if (asset.type === 'element') {
    const label = escapeHtml(assetText(asset));
    return `<div class="absolute left-1/2 top-1/2 flex min-h-[120px] min-w-[240px] -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-white/30 bg-white/10 text-white"${styleAttr}>${label}</div>`;
  }

  const src = escapeAttr(asset.url ?? '');
  if (asset.type === 'image') {
    return `<ef-image src="${src}" duration="${seconds(durationMs)}" class="absolute inset-0 size-full object-cover"${styleAttr}></ef-image>`;
  }

  const trimStart = assetTrimStartMs(asset);
  const trimEnd = assetTrimEndMs(asset);
  const sourceAttrs = [
    trimStart !== undefined ? `sourcein="${seconds(trimStart)}"` : '',
    trimEnd !== undefined ? `sourceout="${seconds(trimEnd)}"` : '',
  ].filter(Boolean).join(' ');

  return `<ef-video src="${src}" ${sourceAttrs} class="absolute inset-0 size-full object-cover"${styleAttr}></ef-video>`;
}

function buildTimedVisualElement(asset: EditframeCompositionAsset, startMs: number, durationMs: number, backgroundColor: string): string {
  const label = escapeHtml(asset.name || assetRole(asset));
  const transition = transitionClass(asset);
  const wrapperStyle = [
    `background:${escapeAttr(backgroundColor)};`,
    `z-index:${assetLayer(asset) + 1};`,
    transitionStyle(asset),
  ].filter(Boolean).join('');
  const classes = [
    'absolute inset-0 h-full w-full overflow-hidden',
    transition,
  ].filter(Boolean).join(' ');

  return [
    `<ef-timegroup mode="fixed" offset="${seconds(startMs)}" duration="${seconds(durationMs)}" data-asset-id="${escapeAttr(asset.id)}" data-role="${escapeAttr(assetRole(asset))}" data-layer="${assetLayer(asset)}" class="${classes}" style="${wrapperStyle}">`,
    buildMediaElement(asset, durationMs),
    `<!-- ${label} -->`,
    '</ef-timegroup>',
  ].join('');
}

function buildAudioElement(asset: EditframeCompositionAsset): string {
  const durationMs = assetDurationMs(asset);
  const startMs = assetStartMs(asset, 0);
  const trimStart = assetTrimStartMs(asset);
  const trimEnd = assetTrimEndMs(asset);
  const sourceAttrs = [
    trimStart !== undefined ? `sourcein="${seconds(trimStart)}"` : '',
    trimEnd !== undefined ? `sourceout="${seconds(trimEnd)}"` : '',
  ].filter(Boolean).join(' ');
  const volume = asset.muted ? 0 : isFiniteNumber(asset.volume) ? asset.volume : metadataNumber(asset, 'volume') ?? 1;
  const fadeIn = assetFadeInMs(asset);
  const fadeOut = assetFadeOutMs(asset);
  const fadeAttrs = [
    fadeIn && fadeIn > 0 ? `data-fade-in-ms="${Math.round(fadeIn)}"` : '',
    fadeOut && fadeOut > 0 ? `data-fade-out-ms="${Math.round(fadeOut)}"` : '',
  ].filter(Boolean).join(' ');
  const audioAttrs = [sourceAttrs, fadeAttrs, `volume="${clamp(volume, 0, 1)}"`].filter(Boolean).join(' ');
  const audio = `<ef-audio src="${escapeAttr(asset.url ?? '')}" ${audioAttrs}></ef-audio>`;

  return `<ef-timegroup mode="fixed" offset="${seconds(startMs)}" duration="${seconds(durationMs)}" data-asset-id="${escapeAttr(asset.id)}" data-role="${escapeAttr(assetRole(asset))}">${audio}</ef-timegroup>`;
}

function stylesheet(): string {
  return [
    '<style>',
    'html,body{margin:0;background:#000;}',
    'ef-timegroup,ef-image,ef-video,ef-text{display:block;}',
    '.size-full{width:100%;height:100%;}',
    '.object-cover{object-fit:cover;}',
    '.absolute{position:absolute;}',
    '.relative{position:relative;}',
    '.inset-0{inset:0;}',
    '.left-1\\/2{left:50%;}',
    '.top-1\\/2{top:50%;}',
    '.h-full{height:100%;}',
    '.w-full{width:100%;}',
    '.overflow-hidden{overflow:hidden;}',
    '.flex{display:flex;}',
    '.items-center{align-items:center;}',
    '.justify-center{justify-content:center;}',
    '.text-white{color:#fff;}',
    '.border{border-width:1px;border-style:solid;}',
    '.border-white\\/30{border-color:rgba(255,255,255,.3);}',
    '.bg-white\\/10{background:rgba(255,255,255,.1);}',
    '.min-h-\\[120px\\]{min-height:120px;}',
    '.min-w-\\[240px\\]{min-width:240px;}',
    '.-translate-x-1\\/2{transform:translateX(-50%);}',
    '.-translate-y-1\\/2{transform:translateY(-50%);}',
    '.wzrd-text{animation: wzrd-text-rise 640ms cubic-bezier(.2,.8,.2,1) both;}',
    '.wzrd-text [data-word]{animation-delay:calc(var(--ef-word-index,0) * 48ms);}',
    '.wzrd-transition{animation-duration:var(--wzrd-transition-duration,500ms);animation-timing-function:cubic-bezier(.2,.8,.2,1);animation-fill-mode:both;}',
    '.wzrd-transition-fade,.wzrd-transition-dissolve{animation-name:wzrd-fade-in;}',
    '.wzrd-transition-slide-left{animation-name:wzrd-slide-left;}',
    '.wzrd-transition-slide-right{animation-name:wzrd-slide-right;}',
    '.wzrd-transition-slide-up{animation-name:wzrd-slide-up;}',
    '.wzrd-transition-slide-down{animation-name:wzrd-slide-down;}',
    '.wzrd-transition-zoom,.wzrd-transition-zoom-in{animation-name:wzrd-zoom-in;}',
    '.wzrd-transition-zoom-out{animation-name:wzrd-zoom-out;}',
    '.wzrd-transition-blur{animation-name:wzrd-blur-in;}',
    '@keyframes wzrd-fade-in{from{opacity:0}to{opacity:1}}',
    '@keyframes wzrd-slide-left{from{opacity:0;transform:translateX(8%)}to{opacity:1;transform:translateX(0)}}',
    '@keyframes wzrd-slide-right{from{opacity:0;transform:translateX(-8%)}to{opacity:1;transform:translateX(0)}}',
    '@keyframes wzrd-slide-up{from{opacity:0;transform:translateY(8%)}to{opacity:1;transform:translateY(0)}}',
    '@keyframes wzrd-slide-down{from{opacity:0;transform:translateY(-8%)}to{opacity:1;transform:translateY(0)}}',
    '@keyframes wzrd-zoom-in{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}',
    '@keyframes wzrd-zoom-out{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}',
    '@keyframes wzrd-blur-in{from{opacity:0;filter:blur(18px)}to{opacity:1;filter:blur(0)}}',
    '@keyframes wzrd-text-rise{from{opacity:0;transform:translate(-50%,-44%)}to{opacity:1;transform:translate(-50%,-50%)}}',
    '</style>',
  ].join('');
}

export function buildEditframeCompositionHtml(
  assets: EditframeCompositionAsset[],
  options: EditframeCompositionOptions = {}
): EditframeCompositionResult {
  const width = options.width && options.width > 0 ? Math.round(options.width) : DEFAULT_WIDTH;
  const height = options.height && options.height > 0 ? Math.round(options.height) : DEFAULT_HEIGHT;
  const fps = options.fps && options.fps > 0 ? Math.round(options.fps) : DEFAULT_FPS;
  const backgroundColor = options.backgroundColor || '#000000';
  const compositionId = options.compositionId || 'wzrd-editframe-composition';

  const visualLike = assets
    .filter((asset) => asset.type === 'text' || asset.type === 'element' || ((asset.type === 'image' || asset.type === 'video') && asset.url))
    .sort((a, b) => (assetStartMs(a, a.orderIndex ?? 0) - assetStartMs(b, b.orderIndex ?? 0)) || (assetLayer(a) - assetLayer(b)) || ((a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
  const audio = assets
    .filter((asset) => asset.type === 'audio' && asset.url)
    .sort((a, b) => assetStartMs(a, a.orderIndex ?? 0) - assetStartMs(b, b.orderIndex ?? 0));

  let cursorMs = 0;
  const visualLayers = visualLike.map((asset) => {
    const hasExplicitStart =
      asset.startMs !== undefined ||
      metadataNumber(asset, 'start_ms') !== undefined ||
      metadataNumber(asset, 'startTime') !== undefined ||
      metadataNumber(asset, 'startTimeMs') !== undefined;
    const startMs = assetStartMs(asset, hasExplicitStart ? 0 : cursorMs);
    const durationMs = assetDurationMs(asset);
    cursorMs = Math.max(cursorMs, startMs + durationMs);
    return buildTimedVisualElement(asset, startMs, durationMs, backgroundColor);
  }).join('');

  const audioLayers = audio.map(buildAudioElement).join('');
  const totalAudioMs = audio.reduce((max, asset) => Math.max(max, assetStartMs(asset, 0) + assetDurationMs(asset)), 0);
  const optionDurationMs = options.durationMs && options.durationMs > 0 ? options.durationMs : 0;
  const durationMs = Math.max(cursorMs, totalAudioMs, optionDurationMs, DEFAULT_IMAGE_DURATION_MS);
  const visualContent = visualLayers || `<ef-timegroup mode="fixed" offset="0s" duration="${seconds(durationMs)}" class="absolute inset-0 h-full w-full" style="background:${escapeAttr(backgroundColor)}"></ef-timegroup>`;

  const html = [
    '<ef-configuration api-host="https://editframe.com">',
    `<ef-timegroup id="${escapeAttr(compositionId)}" mode="contain" duration="${seconds(durationMs)}" fps="${fps}" class="relative overflow-hidden bg-black" style="width:${width}px;height:${height}px;background:${escapeAttr(backgroundColor)}">`,
    visualContent,
    audioLayers,
    '</ef-timegroup>',
    '</ef-configuration>',
    stylesheet(),
  ].join('');

  return { html, width, height, fps, durationMs };
}
