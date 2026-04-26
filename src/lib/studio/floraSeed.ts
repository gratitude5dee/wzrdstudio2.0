import type { EdgeDefinition, NodeDefinition, Port } from '@/types/computeFlow';
import { NODE_TYPE_CONFIGS } from '@/types/computeFlow';
import type { ImageEditLayer, ImageEditNodeParams } from '@/types/imageEdit';
import { DEFAULT_IMAGE_EDIT_PARAMS } from '@/types/imageEdit';

type Point = { x: number; y: number };

export interface FloraSeedGraph {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  focusNodeId: string;
}

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `flora-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const svgToDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s{2,}/g, ' ').trim())}`;

const heroAsset = svgToDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#839f86"/>
        <stop offset="48%" stop-color="#4d6d57"/>
        <stop offset="100%" stop-color="#1d2b25"/>
      </linearGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .18 0"/>
      </filter>
    </defs>
    <rect width="1280" height="720" fill="url(#sky)"/>
    <path d="M0 420 L180 330 L360 390 L520 280 L700 340 L920 250 L1090 320 L1280 260 V720 H0 Z" fill="#304338"/>
    <path d="M0 520 C180 500 260 560 430 545 C590 530 700 470 840 490 C980 510 1080 570 1280 520 V720 H0 Z" fill="#233228"/>
    <rect x="0" y="560" width="1280" height="160" fill="#1c201a"/>
    <path d="M140 520 Q620 470 1160 560" fill="none" stroke="#d64545" stroke-width="14" stroke-linecap="round"/>
    <circle cx="642" cy="334" r="18" fill="#f7e4d2"/>
    <path d="M640 348 C610 410 600 450 565 510" fill="none" stroke="#f3f3e9" stroke-width="18" stroke-linecap="round"/>
    <path d="M638 364 C690 398 760 406 840 384" fill="none" stroke="#f3f3e9" stroke-width="18" stroke-linecap="round"/>
    <path d="M620 372 C662 334 708 302 760 296" fill="none" stroke="#f3f3e9" stroke-width="18" stroke-linecap="round"/>
    <text x="68" y="82" fill="#f3f1e8" font-family="Arial, sans-serif" font-size="28" letter-spacing="4">HIGH JUMP ATHLETE</text>
    <text x="68" y="118" fill="#f3f1e8" font-family="Arial, sans-serif" font-size="18" letter-spacing="3">OUTDOOR TRACK AND FIELD EVENT</text>
    <text x="68" y="152" fill="#f3f1e8" font-family="Arial, sans-serif" font-size="18" letter-spacing="3">SUMMER OLYMPICS, 1978</text>
    <text x="1090" y="82" fill="#f3f1e8" font-family="Arial, sans-serif" font-size="28" letter-spacing="4">HJ/78</text>
    <text x="74" y="432" fill="#f3f1e8" font-family="Arial, sans-serif" font-size="40" letter-spacing="10">RECORD</text>
    <text x="532" y="468" fill="#f3f1e8" font-family="Arial, sans-serif" font-size="40" letter-spacing="10">OBJECT</text>
    <text x="1014" y="450" fill="#f3f1e8" font-family="Arial, sans-serif" font-size="40" letter-spacing="10">ARCHIVE</text>
    <rect width="1280" height="720" filter="url(#grain)" opacity=".22"/>
  </svg>
`);

const pixelBackgroundAsset = svgToDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <rect width="960" height="540" fill="#5CB8E6"/>
  </svg>
`);

const pixelTypeAsset = svgToDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <g fill="#f4db7d">
      <rect x="186" y="232" width="52" height="52"/><rect x="238" y="180" width="52" height="52"/><rect x="290" y="180" width="52" height="52"/><rect x="342" y="232" width="52" height="52"/><rect x="394" y="284" width="52" height="52"/><rect x="446" y="284" width="52" height="52"/><rect x="498" y="232" width="52" height="52"/><rect x="550" y="180" width="52" height="52"/><rect x="602" y="180" width="52" height="52"/><rect x="654" y="232" width="52" height="52"/><rect x="706" y="284" width="52" height="52"/>
      <rect x="186" y="284" width="52" height="52"/><rect x="238" y="336" width="52" height="52"/><rect x="290" y="336" width="52" height="52"/><rect x="342" y="336" width="52" height="52"/><rect x="394" y="336" width="52" height="52"/><rect x="446" y="388" width="52" height="52"/><rect x="498" y="388" width="52" height="52"/><rect x="550" y="336" width="52" height="52"/><rect x="602" y="284" width="52" height="52"/><rect x="654" y="284" width="52" height="52"/>
    </g>
  </svg>
`);

const pixelCompositeAsset = svgToDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <image href="${heroAsset}" width="1280" height="720"/>
    <image href="${pixelTypeAsset}" x="48" y="420" width="520" height="220"/>
  </svg>
`);

const makePorts = (nodeId: string, kind: NodeDefinition['kind'], side: 'inputs' | 'outputs'): Port[] => {
  const config = NODE_TYPE_CONFIGS[kind];
  return (config?.[side] ?? []).map((port, index) => ({
    ...port,
    id: `${nodeId}-${side === 'inputs' ? 'input' : 'output'}-${index}`,
  }));
};

const makeNode = (
  kind: NodeDefinition['kind'],
  label: string,
  position: Point,
  params: Record<string, unknown>,
  preview?: NodeDefinition['preview'],
  metadata?: Record<string, unknown>
): NodeDefinition => {
  const id = createId();
  return {
    id,
    kind,
    version: '1.0.0',
    label,
    position,
    size: { w: 420, h: 300 },
    inputs: makePorts(id, kind, 'inputs'),
    outputs: makePorts(id, kind, 'outputs'),
    params,
    metadata,
    preview,
    status: 'idle',
    progress: 0,
  };
};

const makeEdge = (
  sourceNode: NodeDefinition,
  sourceIndex: number,
  targetNode: NodeDefinition,
  targetIndex: number,
  dataType: EdgeDefinition['dataType']
): EdgeDefinition => ({
  id: createId(),
  source: { nodeId: sourceNode.id, portId: sourceNode.outputs[sourceIndex].id },
  target: { nodeId: targetNode.id, portId: targetNode.inputs[targetIndex].id },
  dataType,
  status: 'idle',
  metadata: {
    label: dataType,
  },
});

const buildCompositeParams = (): ImageEditNodeParams => {
  const baseLayerId = createId();
  const typeLayerId = createId();
  const layers: ImageEditLayer[] = [
    {
      id: baseLayerId,
      name: 'Landing Page Visualization',
      sourceAssetUrl: heroAsset,
      kind: 'base',
      position: { x: 0, y: 0 },
      size: { width: 960, height: 540 },
      rotation: 0,
      opacity: 100,
      visible: true,
      locked: false,
      zIndex: 0,
      flipX: false,
      flipY: false,
    },
    {
      id: typeLayerId,
      name: 'Pixelated Type',
      sourceAssetUrl: pixelTypeAsset,
      kind: 'cutout',
      position: { x: 58, y: 322 },
      size: { width: 390, height: 164 },
      rotation: 0,
      opacity: 100,
      visible: true,
      locked: false,
      zIndex: 1,
      flipX: false,
      flipY: false,
    },
  ];

  return {
    ...DEFAULT_IMAGE_EDIT_PARAMS,
    aspectRatio: '16:9',
    activeTool: 'splitLayers',
    lastOperation: 'splitLayers',
    pendingPrompt: 'remove text here',
    selectedLayerId: typeLayerId,
    layers,
    previewAssetUrl: pixelCompositeAsset,
    outputAssetUrl: pixelCompositeAsset,
  };
};

export const FLORA_EXAMPLE_COPY = {
  landingPrompt: 'give me a prompt for a sleek, 16:9, landing page composition.',
  landingPromptExpanded:
    'Full-bleed square landing page hero, 16:9. Background: vintage 1970s film photograph of an outdoor track-and-field high jump moment, athlete mid-arch over a red curved bar, editorial overlay typography, cinematic archive feel.',
  pixelPrompt:
    "inspire me with a prompt that visualizes a pixelated 'Luck' in flowing cursive.",
  pixelPromptExpanded:
    'Pixel-art typography on a sky-blue background: the word "Luck" written in flowing cursive script, rendered as chunky 8-bit square pixels in pastel yellow, centered composition, minimal design, playful retro vibe.',
} as const;

export function buildFloraSeedGraph(origin: Point = { x: 180, y: 140 }): FloraSeedGraph {
  const landingPrompt = makeNode(
    'Text',
    'Text 1',
    { x: origin.x, y: origin.y },
    {
      prompt: FLORA_EXAMPLE_COPY.landingPrompt,
      content: FLORA_EXAMPLE_COPY.landingPromptExpanded,
      floraTitle: 'Text 1',
    },
    {
      id: createId(),
      type: 'text',
      data: { text: FLORA_EXAMPLE_COPY.landingPromptExpanded },
    },
    { floraSeed: true, floraRole: 'prompt-source' }
  );

  const heroNode = makeNode(
    'Image',
    'Athletic Hero Page',
    { x: origin.x + 430, y: origin.y - 36 },
    {
      prompt: FLORA_EXAMPLE_COPY.landingPromptExpanded,
      imageUrl: heroAsset,
      aspectRatio: '16:9',
    },
    { id: createId(), type: 'image', url: heroAsset, data: { url: heroAsset } },
    { floraSeed: true, floraRole: 'hero-image' }
  );

  const pixelPrompt = makeNode(
    'Text',
    'Text 2',
    { x: origin.x, y: origin.y + 330 },
    {
      prompt: FLORA_EXAMPLE_COPY.pixelPrompt,
      content: FLORA_EXAMPLE_COPY.pixelPromptExpanded,
      floraTitle: 'Text 2',
    },
    {
      id: createId(),
      type: 'text',
      data: { text: FLORA_EXAMPLE_COPY.pixelPromptExpanded },
    },
    { floraSeed: true, floraRole: 'pixel-prompt' }
  );

  const pixelNode = makeNode(
    'Image',
    'Pixelated Type Design',
    { x: origin.x + 430, y: origin.y + 286 },
    {
      prompt: FLORA_EXAMPLE_COPY.pixelPromptExpanded,
      imageUrl: pixelCompositeAsset,
      aspectRatio: '16:9',
    },
    { id: createId(), type: 'image', url: pixelCompositeAsset, data: { url: pixelCompositeAsset } },
    { floraSeed: true, floraRole: 'pixel-image' }
  );

  const backgroundSplitNode = makeNode(
    'Image',
    'Type Background Split',
    { x: origin.x + 860, y: origin.y + 214 },
    {
      prompt: 'Background layer',
      imageUrl: pixelBackgroundAsset,
      aspectRatio: '16:9',
    },
    { id: createId(), type: 'image', url: pixelBackgroundAsset, data: { url: pixelBackgroundAsset } },
    { floraSeed: true, floraRole: 'split-background' }
  );

  const typeSplitNode = makeNode(
    'Image',
    'Pixelated Type',
    { x: origin.x + 860, y: origin.y + 430 },
    {
      prompt: 'Transparent type layer',
      imageUrl: pixelTypeAsset,
      aspectRatio: '16:9',
    },
    { id: createId(), type: 'image', url: pixelTypeAsset, data: { url: pixelTypeAsset } },
    { floraSeed: true, floraRole: 'split-type' }
  );

  const compositeNode = makeNode(
    'ImageEdit',
    'Landing Page Compositing',
    { x: origin.x + 1310, y: origin.y + 126 },
    buildCompositeParams() as unknown as Record<string, unknown>,
    { id: createId(), type: 'image', url: pixelCompositeAsset, data: { url: pixelCompositeAsset } },
    { floraSeed: true, floraRole: 'composite' }
  );

  const nodes = [
    landingPrompt,
    heroNode,
    pixelPrompt,
    pixelNode,
    backgroundSplitNode,
    typeSplitNode,
    compositeNode,
  ];

  const edges = [
    makeEdge(landingPrompt, 0, heroNode, 0, 'text'),
    makeEdge(pixelPrompt, 0, pixelNode, 0, 'text'),
    makeEdge(pixelNode, 0, backgroundSplitNode, 0, 'image'),
    makeEdge(pixelNode, 0, typeSplitNode, 0, 'image'),
    makeEdge(heroNode, 0, compositeNode, 1, 'image'),
    makeEdge(typeSplitNode, 0, compositeNode, 1, 'image'),
    makeEdge(pixelPrompt, 0, compositeNode, 0, 'text'),
  ];

  return {
    nodes,
    edges,
    focusNodeId: compositeNode.id,
  };
}

export function isFloraSeedNode(node?: Pick<NodeDefinition, 'metadata'> | null) {
  return Boolean(node?.metadata && (node.metadata as Record<string, unknown>).floraSeed);
}

export const FLORA_SEED_ASSETS = {
  heroAsset,
  pixelBackgroundAsset,
  pixelTypeAsset,
  pixelCompositeAsset,
} as const;
