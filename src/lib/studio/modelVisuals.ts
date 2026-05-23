import type { CatalogModelSummary } from '@/hooks/useCatalogModels';

type VisualPalette = {
  bg: string;
  a: string;
  b: string;
  c: string;
};

const PALETTES: Record<string, VisualPalette> = {
  image: { bg: '#111111', a: '#f97316', b: '#38bdf8', c: '#f8fafc' },
  video: { bg: '#101114', a: '#22c55e', b: '#f97316', c: '#e5e7eb' },
  audio: { bg: '#111112', a: '#eab308', b: '#06b6d4', c: '#f4f4f5' },
  text: { bg: '#101010', a: '#a3e635', b: '#f8fafc', c: '#71717a' },
  json: { bg: '#101112', a: '#14b8a6', b: '#f97316', c: '#f4f4f5' },
  '3d': { bg: '#101113', a: '#f43f5e', b: '#38bdf8', c: '#f4f4f5' },
  fal: { bg: '#111111', a: '#f97316', b: '#facc15', c: '#ffffff' },
  gmi: { bg: '#111216', a: '#60a5fa', b: '#22c55e', c: '#ffffff' },
};

function paletteForModel(model: Partial<CatalogModelSummary>): VisualPalette {
  const provider = model.provider ?? '';
  if (provider === 'fal-ai') return PALETTES.fal;
  if (provider === 'gmi-cloud') return PALETTES.gmi;
  return PALETTES[model.media_type ?? 'image'] ?? PALETTES.image;
}

function patternForWorkflow(workflowType?: string): string {
  const workflow = workflowType ?? '';
  if (workflow.includes('video')) return 'timeline';
  if (workflow.includes('audio') || workflow.includes('speech')) return 'wave';
  if (workflow.includes('3d')) return 'mesh';
  if (workflow.includes('json') || workflow.includes('vision')) return 'grid';
  if (workflow.includes('edit') || workflow.includes('image-to-image')) return 'mask';
  return 'frames';
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getModelThumbnail(model: Partial<CatalogModelSummary>): string {
  const palette = paletteForModel(model);
  const pattern = patternForWorkflow(model.workflow_type);
  const title = xmlEscape((model.family ?? model.vendor ?? model.provider_label ?? model.provider ?? 'AI').slice(0, 16));
  const subtitle = (model.media_type ?? 'model').toUpperCase();

  const patternMarkup =
    pattern === 'timeline'
      ? `<rect x="12" y="24" width="104" height="56" rx="8" fill="${palette.a}" opacity=".88"/><rect x="22" y="88" width="22" height="16" rx="3" fill="${palette.b}"/><rect x="50" y="88" width="22" height="16" rx="3" fill="${palette.c}" opacity=".75"/><rect x="78" y="88" width="22" height="16" rx="3" fill="${palette.b}" opacity=".55"/>`
      : pattern === 'wave'
        ? `<path d="M14 72 C26 40 36 104 48 72 S70 40 82 72 104 104 116 72" fill="none" stroke="${palette.a}" stroke-width="8" stroke-linecap="round"/><path d="M18 92 H110" stroke="${palette.b}" stroke-width="3" opacity=".7"/>`
        : pattern === 'mesh'
          ? `<path d="M64 18 110 45 110 91 64 118 18 91 18 45Z" fill="none" stroke="${palette.a}" stroke-width="5"/><path d="M64 18v100M18 45l92 46M110 45 18 91" stroke="${palette.b}" stroke-width="3" opacity=".8"/>`
          : pattern === 'grid'
            ? `<path d="M18 30h92M18 54h92M18 78h92M18 102h92M32 20v92M60 20v92M88 20v92" stroke="${palette.a}" stroke-width="3" opacity=".85"/><rect x="36" y="58" width="48" height="20" rx="5" fill="${palette.b}" opacity=".72"/>`
            : pattern === 'mask'
              ? `<rect x="14" y="26" width="54" height="76" rx="10" fill="${palette.a}" opacity=".9"/><rect x="60" y="26" width="54" height="76" rx="10" fill="${palette.b}" opacity=".72"/><path d="M42 82 C54 58 72 58 84 82" stroke="${palette.c}" stroke-width="5" fill="none" stroke-linecap="round"/>`
              : `<rect x="14" y="24" width="46" height="58" rx="8" fill="${palette.a}" opacity=".92"/><rect x="48" y="36" width="46" height="58" rx="8" fill="${palette.b}" opacity=".72"/><rect x="82" y="48" width="32" height="46" rx="7" fill="${palette.c}" opacity=".58"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${title}"><rect width="128" height="128" rx="14" fill="${palette.bg}"/><path d="M0 0h128v128H0z" fill="url(#grain)" opacity=".18"/><defs><pattern id="grain" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 15h16M15 0v16" stroke="${palette.c}" stroke-width=".6" opacity=".35"/></pattern></defs>${patternMarkup}<text x="12" y="116" fill="${palette.c}" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="700">${subtitle}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
