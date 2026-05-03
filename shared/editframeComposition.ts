export type EditframeAssetType = 'image' | 'video' | 'audio';

export interface EditframeCompositionAsset {
  id: string;
  type: EditframeAssetType;
  url: string;
  name?: string;
  durationMs?: number | null;
  orderIndex?: number;
  startMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  volume?: number;
  muted?: boolean;
  role?: string;
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function metadataNumber(asset: EditframeCompositionAsset, key: string): number | undefined {
  const value = asset.metadata?.[key];
  return isFiniteNumber(value) ? value : undefined;
}

function metadataString(asset: EditframeCompositionAsset, key: string): string | undefined {
  const value = asset.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function seconds(ms: number): string {
  return `${Math.max(0, ms) / 1000}s`;
}

function assetStartMs(asset: EditframeCompositionAsset, fallback = 0): number {
  return asset.startMs ?? metadataNumber(asset, 'start_ms') ?? metadataNumber(asset, 'startTime') ?? fallback;
}

function assetDurationMs(asset: EditframeCompositionAsset): number {
  return (
    asset.durationMs ??
    metadataNumber(asset, 'duration_ms') ??
    metadataNumber(asset, 'durationMs') ??
    (asset.type === 'image' ? DEFAULT_IMAGE_DURATION_MS : DEFAULT_VIDEO_DURATION_MS)
  );
}

function assetTrimStartMs(asset: EditframeCompositionAsset): number | undefined {
  return asset.trimStartMs ?? metadataNumber(asset, 'trimStartMs') ?? metadataNumber(asset, 'trim_start_ms');
}

function assetTrimEndMs(asset: EditframeCompositionAsset): number | undefined {
  return asset.trimEndMs ?? metadataNumber(asset, 'trimEndMs') ?? metadataNumber(asset, 'trim_end_ms');
}

function assetRole(asset: EditframeCompositionAsset): string {
  return asset.role ?? metadataString(asset, 'asset_role') ?? metadataString(asset, 'role') ?? asset.type;
}

function transformStyle(asset: EditframeCompositionAsset): string {
  const transforms = asset.transforms ?? (asset.metadata?.transforms as EditframeCompositionAsset['transforms'] | undefined);
  if (!transforms) return '';

  const position = transforms.position ?? {};
  const scale = transforms.scale ?? {};
  const translateX = isFiniteNumber(position.x) ? position.x : 0;
  const translateY = isFiniteNumber(position.y) ? position.y : 0;
  const scaleX = isFiniteNumber(scale.x) ? scale.x : 1;
  const scaleY = isFiniteNumber(scale.y) ? scale.y : 1;
  const rotation = isFiniteNumber(transforms.rotation) ? transforms.rotation : 0;
  const opacity = isFiniteNumber(transforms.opacity) ? transforms.opacity : 1;

  return [
    `transform: translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg);`,
    `opacity: ${Math.min(1, Math.max(0, opacity))};`,
  ].join(' ');
}

function buildMediaElement(asset: EditframeCompositionAsset, durationMs: number): string {
  const src = escapeAttr(asset.url);
  const style = transformStyle(asset);
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : '';

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
  const audio = `<ef-audio src="${escapeAttr(asset.url)}" ${sourceAttrs} volume="${Math.min(1, Math.max(0, volume))}"></ef-audio>`;

  if (startMs <= 0) {
    return `<ef-timegroup mode="fixed" duration="${seconds(durationMs)}">${audio}</ef-timegroup>`;
  }

  return [
    '<ef-timegroup mode="sequence">',
    `<ef-timegroup mode="fixed" duration="${seconds(startMs)}"></ef-timegroup>`,
    `<ef-timegroup mode="fixed" duration="${seconds(durationMs)}">${audio}</ef-timegroup>`,
    '</ef-timegroup>',
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

  const visuals = assets
    .filter((asset) => (asset.type === 'image' || asset.type === 'video') && asset.url)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const audio = assets
    .filter((asset) => asset.type === 'audio' && asset.url)
    .sort((a, b) => assetStartMs(a, a.orderIndex ?? 0) - assetStartMs(b, b.orderIndex ?? 0));

  let cursorMs = 0;
  const visualScenes = visuals.map((asset) => {
    const startMs = assetStartMs(asset, cursorMs);
    const durationMs = assetDurationMs(asset);
    const gapMs = Math.max(0, startMs - cursorMs);
    cursorMs = Math.max(cursorMs, startMs + durationMs);
    const label = escapeHtml(asset.name || assetRole(asset));
    const media = buildMediaElement(asset, durationMs);
    const scene = [
      `<ef-timegroup mode="fixed" duration="${seconds(durationMs)}" data-asset-id="${escapeAttr(asset.id)}" data-role="${escapeAttr(assetRole(asset))}" class="absolute inset-0 h-full w-full overflow-hidden" style="background:${escapeAttr(backgroundColor)}">`,
      media,
      `<!-- ${label} -->`,
      '</ef-timegroup>',
    ].join('');

    return gapMs > 0
      ? `<ef-timegroup mode="fixed" duration="${seconds(gapMs)}" class="absolute inset-0 h-full w-full" style="background:${escapeAttr(backgroundColor)}"></ef-timegroup>${scene}`
      : scene;
  }).join('');

  const audioLayers = audio.map(buildAudioElement).join('');
  const totalAudioMs = audio.reduce((max, asset) => Math.max(max, assetStartMs(asset, 0) + assetDurationMs(asset)), 0);
  const durationMs = Math.max(cursorMs, totalAudioMs, DEFAULT_IMAGE_DURATION_MS);
  const visualSequence = visualScenes || `<ef-timegroup mode="fixed" duration="${seconds(durationMs)}" class="absolute inset-0 h-full w-full" style="background:${escapeAttr(backgroundColor)}"></ef-timegroup>`;

  const html = [
    '<ef-configuration api-host="https://editframe.com">',
    `<ef-timegroup id="${escapeAttr(compositionId)}" mode="contain" fps="${fps}" class="relative overflow-hidden bg-black" style="width:${width}px;height:${height}px;background:${escapeAttr(backgroundColor)}">`,
    `<ef-timegroup mode="sequence" class="absolute inset-0 h-full w-full">${visualSequence}</ef-timegroup>`,
    audioLayers,
    '</ef-timegroup>',
    '</ef-configuration>',
    '<style>',
    'html,body{margin:0;background:#000;}',
    'ef-timegroup,ef-image,ef-video{display:block;}',
    '.size-full{width:100%;height:100%;}',
    '.object-cover{object-fit:cover;}',
    '</style>',
  ].join('');

  return { html, width, height, fps, durationMs };
}
