export type MediaActionDataType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'json'
  | '3d'
  | 'tensor'
  | 'string'
  | 'number'
  | 'boolean'
  | 'any';

export type MediaActionNodeKind =
  | 'Text'
  | 'Prompt'
  | 'Image'
  | 'ImageEdit'
  | 'Video'
  | 'Audio'
  | 'Upload'
  | 'Transform'
  | 'Combine'
  | 'Model'
  | 'Gateway'
  | 'Output';

export type MediaActionBatchPolicy = 'single' | 'map' | 'zip' | 'cartesian' | 'fanOut';
export type MediaActionExecutor =
  | 'text_utility'
  | 'fal'
  | 'ffmpeg'
  | 'embed'
  | 'passthrough'
  | 'output';
export type MediaActionProvider = 'fal-ai' | 'edge_function' | 'local' | 'none';
export type MediaActionControlType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'slider'
  | 'switch'
  | 'color'
  | 'file'
  | 'number';

export interface MediaActionPort {
  id: string;
  name: string;
  datatype: MediaActionDataType;
  cardinality: '1' | 'n';
  optional?: boolean;
  position: 'top' | 'right' | 'bottom' | 'left';
  paramKey?: string;
}

export interface MediaActionControl {
  id: string;
  label: string;
  type: MediaActionControlType;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
}

export interface MediaActionDefinition {
  actionId: string;
  nodeKind: MediaActionNodeKind;
  label: string;
  description: string;
  mediaType: MediaActionDataType;
  workflowType: string;
  inputs: MediaActionPort[];
  outputs: MediaActionPort[];
  controls?: MediaActionControl[];
  defaultModelId?: string;
  providerPreference: MediaActionProvider[];
  executor: MediaActionExecutor;
  costEstimate: number;
  batchPolicy: MediaActionBatchPolicy;
  outputPreviewType: MediaActionDataType;
  tags?: string[];
  defaultParams?: Record<string, unknown>;
}

const input = (
  name: string,
  datatype: MediaActionDataType,
  options: Partial<MediaActionPort> = {}
): MediaActionPort => ({
  id: options.id ?? name,
  name,
  datatype,
  cardinality: options.cardinality ?? '1',
  optional: options.optional,
  position: options.position ?? 'left',
  paramKey: options.paramKey ?? name,
});

const output = (
  name: string,
  datatype: MediaActionDataType,
  options: Partial<MediaActionPort> = {}
): MediaActionPort => ({
  id: options.id ?? name,
  name,
  datatype,
  cardinality: options.cardinality ?? 'n',
  optional: options.optional,
  position: options.position ?? 'right',
  paramKey: options.paramKey,
});

const slider = (
  id: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  step = 1
): MediaActionControl => ({ id, label, type: 'slider', defaultValue, min, max, step });

const toggle = (id: string, label: string, defaultValue = false): MediaActionControl => ({
  id,
  label,
  type: 'switch',
  defaultValue,
});

const select = (
  id: string,
  label: string,
  defaultValue: string,
  options: Array<{ label: string; value: string }>
): MediaActionControl => ({ id, label, type: 'select', defaultValue, options });

const color = (id: string, label: string, defaultValue: string): MediaActionControl => ({
  id,
  label,
  type: 'color',
  defaultValue,
});

const imageGenerationControls: MediaActionControl[] = [
  select('aspectRatio', 'Aspect Ratio', '16:9', [
    { label: '1:1', value: '1:1' },
    { label: '16:9', value: '16:9' },
    { label: '9:16', value: '9:16' },
    { label: '4:3', value: '4:3' },
    { label: '3:4', value: '3:4' },
  ]),
  select('resolution', 'Resolution', '2K', [
    { label: '1K', value: '1K' },
    { label: '2K', value: '2K' },
    { label: '4K', value: '4K' },
  ]),
  { id: 'numImages', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 8, step: 1 },
  { id: 'seed', label: 'Seed', type: 'number', defaultValue: 0, min: 0, max: 999999999, step: 1 },
];

const videoGenerationControls: MediaActionControl[] = [
  select('aspectRatio', 'Aspect Ratio', '16:9', [
    { label: '16:9', value: '16:9' },
    { label: '9:16', value: '9:16' },
    { label: '1:1', value: '1:1' },
  ]),
  { id: 'duration', label: 'Duration', type: 'number', defaultValue: 5, min: 1, max: 10, step: 1 },
  toggle('generateAudio', 'Generate Audio', false),
  { id: 'seed', label: 'Seed', type: 'number', defaultValue: 0, min: 0, max: 999999999, step: 1 },
];

export const MEDIA_ACTIONS: MediaActionDefinition[] = [
  {
    actionId: 'text.enter',
    nodeKind: 'Text',
    label: 'Enter Text',
    description: 'Write or paste text onto the canvas.',
    mediaType: 'text',
    workflowType: 'text-source',
    inputs: [],
    outputs: [output('text', 'text')],
    controls: [{ id: 'content', label: 'Text', type: 'textarea', defaultValue: '' }],
    providerPreference: ['none'],
    executor: 'passthrough',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: 'text',
    defaultParams: { content: '' },
  },
  {
    actionId: 'text.split',
    nodeKind: 'Transform',
    label: 'Split Text',
    description: 'Split text into lines, paragraphs, or delimiter-separated parts.',
    mediaType: 'text',
    workflowType: 'text-transform',
    inputs: [input('text', 'text')],
    outputs: [output('parts', 'text', { cardinality: 'n' })],
    controls: [
      select('mode', 'Mode', 'lines', [
        { label: 'Lines', value: 'lines' },
        { label: 'Paragraphs', value: 'paragraphs' },
        { label: 'Delimiter', value: 'delimiter' },
      ]),
      { id: 'delimiter', label: 'Delimiter', type: 'text', defaultValue: ',' },
    ],
    providerPreference: ['local'],
    executor: 'text_utility',
    costEstimate: 0,
    batchPolicy: 'fanOut',
    outputPreviewType: 'text',
  },
  {
    actionId: 'text.concat',
    nodeKind: 'Combine',
    label: 'Concat Text',
    description: 'Join multiple text inputs into one output.',
    mediaType: 'text',
    workflowType: 'text-combine',
    inputs: [input('text', 'text', { cardinality: 'n', paramKey: 'parts' })],
    outputs: [output('text', 'text')],
    controls: [{ id: 'separator', label: 'Separator', type: 'text', defaultValue: '\n' }],
    providerPreference: ['local'],
    executor: 'text_utility',
    costEstimate: 0,
    batchPolicy: 'zip',
    outputPreviewType: 'text',
  },
  {
    actionId: 'text.find-replace',
    nodeKind: 'Transform',
    label: 'Find and Replace',
    description: 'Replace text with optional case sensitivity.',
    mediaType: 'text',
    workflowType: 'text-transform',
    inputs: [input('text', 'text')],
    outputs: [output('text', 'text')],
    controls: [
      { id: 'find', label: 'Find', type: 'text', defaultValue: '' },
      { id: 'replace', label: 'Replace', type: 'text', defaultValue: '' },
      toggle('caseSensitive', 'Case Sensitive', false),
    ],
    providerPreference: ['local'],
    executor: 'text_utility',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'text',
  },
  {
    actionId: 'text.summarize',
    nodeKind: 'Text',
    label: 'Summarize',
    description: 'Summarize connected text or media context.',
    mediaType: 'text',
    workflowType: 'summarization',
    inputs: [input('input', 'any', { cardinality: 'n', optional: true })],
    outputs: [output('text', 'text')],
    defaultModelId: 'gmi/deepseek-r1',
    providerPreference: ['edge_function'],
    executor: 'fal',
    costEstimate: 1,
    batchPolicy: 'map',
    outputPreviewType: 'text',
  },
  {
    actionId: 'text.prompt-generation',
    nodeKind: 'Prompt',
    label: 'Prompt Generation',
    description: 'Turn text or media context into generation-ready prompts.',
    mediaType: 'text',
    workflowType: 'prompt-generation',
    inputs: [input('context', 'any', { cardinality: 'n', optional: true })],
    outputs: [output('text', 'text')],
    defaultModelId: 'gmi/deepseek-r1',
    providerPreference: ['edge_function'],
    executor: 'fal',
    costEstimate: 1,
    batchPolicy: 'map',
    outputPreviewType: 'text',
  },
  {
    actionId: 'image.upload',
    nodeKind: 'Upload',
    label: 'Image Upload',
    description: 'Import an image asset.',
    mediaType: 'image',
    workflowType: 'upload',
    inputs: [],
    outputs: [output('image', 'image')],
    controls: [{ id: 'file', label: 'File', type: 'file' }],
    providerPreference: ['none'],
    executor: 'passthrough',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: 'image',
  },
  {
    actionId: 'image.generate',
    nodeKind: 'Image',
    label: 'Image Prompt',
    description: 'Generate an image from a text prompt and optional references.',
    mediaType: 'image',
    workflowType: 'text-to-image',
    inputs: [
      input('prompt', 'text', { optional: true }),
      input('reference', 'image', { optional: true, position: 'top', paramKey: 'referenceImageUrls' }),
    ],
    outputs: [output('image', 'image'), output('metadata', 'json', { position: 'bottom' })],
    controls: imageGenerationControls,
    defaultModelId: 'fal-ai/nano-banana-2',
    providerPreference: ['fal-ai'],
    executor: 'fal',
    costEstimate: 4,
    batchPolicy: 'map',
    outputPreviewType: 'image',
    defaultParams: { model: 'fal-ai/nano-banana-2', aspectRatio: '16:9', resolution: '2K', numImages: 1 },
  },
  {
    actionId: 'image.edit',
    nodeKind: 'ImageEdit',
    label: 'Image Edit',
    description: 'Edit or inpaint an image using prompt, image, and mask inputs.',
    mediaType: 'image',
    workflowType: 'image-edit',
    inputs: [
      input('image', 'image', { cardinality: 'n', paramKey: 'sourceImageUrl' }),
      input('prompt', 'text', { optional: true }),
      input('mask', 'image', { optional: true, paramKey: 'maskImageUrl' }),
    ],
    outputs: [output('image', 'image'), output('layers', 'json', { position: 'bottom' })],
    controls: imageGenerationControls,
    defaultModelId: 'fal-ai/nano-banana-2/edit',
    providerPreference: ['fal-ai'],
    executor: 'fal',
    costEstimate: 4,
    batchPolicy: 'map',
    outputPreviewType: 'image',
    defaultParams: { model: 'fal-ai/nano-banana-2/edit', aspectRatio: '16:9', resolution: '2K' },
  },
  {
    actionId: 'image.color-key',
    nodeKind: 'Transform',
    label: 'Color Key',
    description: 'Isolate, replace, or remove pixels within a target color tolerance.',
    mediaType: 'image',
    workflowType: 'image-utility',
    inputs: [input('image', 'image')],
    outputs: [output('image', 'image')],
    controls: [
      color('targetColor', 'Target Color', '#00ff00'),
      slider('tolerance', 'Tolerance', 32, 0, 255),
      slider('edgeSoftness', 'Edge Softness', 4, 0, 64),
      select('mode', 'Mode', 'remove', [
        { label: 'Remove', value: 'remove' },
        { label: 'Replace', value: 'replace' },
        { label: 'Isolate', value: 'isolate' },
      ]),
      toggle('invertSelection', 'Invert Selection', false),
    ],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'image',
  },
  {
    actionId: 'image.color-grade',
    nodeKind: 'Transform',
    label: 'Color Grade Image',
    description: 'Adjust color, tone, and contrast.',
    mediaType: 'image',
    workflowType: 'image-utility',
    inputs: [input('image', 'image')],
    outputs: [output('image', 'image')],
    controls: [
      slider('brightness', 'Brightness', 0, -100, 100),
      slider('contrast', 'Contrast', 0, -100, 100),
      slider('saturation', 'Saturation', 0, -100, 100),
    ],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'image',
  },
  {
    actionId: 'image.blur',
    nodeKind: 'Transform',
    label: 'Blur',
    description: 'Apply gaussian, box, motion, radial, or bilateral blur.',
    mediaType: 'image',
    workflowType: 'image-utility',
    inputs: [input('image', 'image')],
    outputs: [output('image', 'image')],
    controls: [
      select('mode', 'Mode', 'gaussian', [
        { label: 'Gaussian', value: 'gaussian' },
        { label: 'Box', value: 'box' },
        { label: 'Motion', value: 'motion' },
        { label: 'Radial', value: 'radial' },
      ]),
      slider('amount', 'Amount', 8, 0, 64),
    ],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'image',
  },
  {
    actionId: 'image.duplicate',
    nodeKind: 'Transform',
    label: 'Duplicate Image',
    description: 'Output copies of the input image.',
    mediaType: 'image',
    workflowType: 'image-utility',
    inputs: [input('image', 'image')],
    outputs: [output('image', 'image', { cardinality: 'n' })],
    controls: [{ id: 'copies', label: 'Copies', type: 'number', defaultValue: 2, min: 1, max: 16, step: 1 }],
    providerPreference: ['local'],
    executor: 'passthrough',
    costEstimate: 0,
    batchPolicy: 'fanOut',
    outputPreviewType: 'image',
  },
  {
    actionId: 'video.upload',
    nodeKind: 'Upload',
    label: 'Video Upload',
    description: 'Import a video asset.',
    mediaType: 'video',
    workflowType: 'upload',
    inputs: [],
    outputs: [output('video', 'video')],
    controls: [{ id: 'file', label: 'File', type: 'file' }],
    providerPreference: ['none'],
    executor: 'passthrough',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: 'video',
  },
  {
    actionId: 'video.generate',
    nodeKind: 'Video',
    label: 'Video Prompt',
    description: 'Generate video from prompt and optional image reference.',
    mediaType: 'video',
    workflowType: 'text-to-video',
    inputs: [
      input('prompt', 'text', { optional: true }),
      input('image', 'image', { optional: true, position: 'top', paramKey: 'firstFrameImageUrl' }),
    ],
    outputs: [output('video', 'video')],
    controls: videoGenerationControls,
    defaultModelId: 'fal-ai/kling-video/o3/standard/text-to-video',
    providerPreference: ['fal-ai'],
    executor: 'fal',
    costEstimate: 10,
    batchPolicy: 'map',
    outputPreviewType: 'video',
    defaultParams: { model: 'fal-ai/kling-video/o3/standard/text-to-video', aspectRatio: '16:9', duration: 5 },
  },
  {
    actionId: 'video.image-to-video',
    nodeKind: 'Video',
    label: 'Image to Video',
    description: 'Animate a still image into a video.',
    mediaType: 'video',
    workflowType: 'image-to-video',
    inputs: [
      input('image', 'image', { paramKey: 'firstFrameImageUrl' }),
      input('prompt', 'text', { optional: true }),
    ],
    outputs: [output('video', 'video')],
    controls: videoGenerationControls,
    defaultModelId: 'fal-ai/kling-video/o3/standard/image-to-video',
    providerPreference: ['fal-ai'],
    executor: 'fal',
    costEstimate: 10,
    batchPolicy: 'map',
    outputPreviewType: 'video',
    defaultParams: { model: 'fal-ai/kling-video/o3/standard/image-to-video', aspectRatio: '16:9', duration: 5 },
  },
  {
    actionId: 'video.extract-frames',
    nodeKind: 'Transform',
    label: 'Extract Video Frames',
    description: 'Extract still frames from video.',
    mediaType: 'video',
    workflowType: 'video-utility',
    inputs: [input('video', 'video')],
    outputs: [output('image', 'image', { cardinality: 'n' })],
    controls: [
      { id: 'fps', label: 'FPS', type: 'number', defaultValue: 1, min: 0.1, max: 60, step: 0.1 },
      select('format', 'Format', 'png', [
        { label: 'PNG', value: 'png' },
        { label: 'JPG', value: 'jpg' },
      ]),
    ],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'fanOut',
    outputPreviewType: 'image',
  },
  {
    actionId: 'video.frame-grid',
    nodeKind: 'Transform',
    label: 'Video to Frame Grid',
    description: 'Extract frames and arrange them into a grid.',
    mediaType: 'image',
    workflowType: 'video-utility',
    inputs: [input('video', 'video')],
    outputs: [output('image', 'image')],
    controls: [
      { id: 'rows', label: 'Rows', type: 'number', defaultValue: 3, min: 1, max: 12, step: 1 },
      { id: 'columns', label: 'Columns', type: 'number', defaultValue: 3, min: 1, max: 12, step: 1 },
      { id: 'gap', label: 'Gap', type: 'number', defaultValue: 8, min: 0, max: 64, step: 1 },
      color('backgroundColor', 'Background', '#000000'),
    ],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'image',
  },
  {
    actionId: 'video.stitch',
    nodeKind: 'Combine',
    label: 'Stitch Videos',
    description: 'Join multiple clips into one video.',
    mediaType: 'video',
    workflowType: 'video-utility',
    inputs: [input('video', 'video', { cardinality: 'n', paramKey: 'clips' })],
    outputs: [output('video', 'video')],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'zip',
    outputPreviewType: 'video',
  },
  {
    actionId: 'video.split',
    nodeKind: 'Transform',
    label: 'Split Video',
    description: 'Cut a video into segments.',
    mediaType: 'video',
    workflowType: 'video-utility',
    inputs: [input('video', 'video')],
    outputs: [output('video', 'video', { cardinality: 'n' })],
    controls: [
      { id: 'segmentSeconds', label: 'Segment Seconds', type: 'number', defaultValue: 5, min: 1, max: 120, step: 1 },
    ],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'fanOut',
    outputPreviewType: 'video',
  },
  {
    actionId: 'video.reverse',
    nodeKind: 'Transform',
    label: 'Reverse Video',
    description: 'Play video in reverse.',
    mediaType: 'video',
    workflowType: 'video-utility',
    inputs: [input('video', 'video')],
    outputs: [output('video', 'video')],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'video',
  },
  {
    actionId: 'video.boomerang',
    nodeKind: 'Transform',
    label: 'Boomerang',
    description: 'Play forward then reverse for a looping effect.',
    mediaType: 'video',
    workflowType: 'video-utility',
    inputs: [input('video', 'video')],
    outputs: [output('video', 'video')],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'video',
  },
  {
    actionId: 'video.speed',
    nodeKind: 'Transform',
    label: 'Speed Up Video',
    description: 'Change playback speed while keeping or dropping audio.',
    mediaType: 'video',
    workflowType: 'video-utility',
    inputs: [input('video', 'video')],
    outputs: [output('video', 'video')],
    controls: [slider('speed', 'Speed', 2, 0.25, 8, 0.25), toggle('keepAudio', 'Keep Audio', true)],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'video',
  },
  {
    actionId: 'video.watermark',
    nodeKind: 'Transform',
    label: 'Watermark',
    description: 'Burn text or image watermark into video.',
    mediaType: 'video',
    workflowType: 'video-utility',
    inputs: [
      input('video', 'video'),
      input('watermark', 'image', { optional: true, position: 'top' }),
    ],
    outputs: [output('video', 'video')],
    controls: [{ id: 'text', label: 'Text', type: 'text', defaultValue: '' }, slider('opacity', 'Opacity', 0.75, 0, 1, 0.05)],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'map',
    outputPreviewType: 'video',
  },
  {
    actionId: 'video.lipsync',
    nodeKind: 'Video',
    label: 'Lipsync',
    description: 'Synchronize a face video/image with audio.',
    mediaType: 'video',
    workflowType: 'lip-sync',
    inputs: [
      input('image', 'image', { optional: true }),
      input('video', 'video', { optional: true }),
      input('audio', 'audio'),
    ],
    outputs: [output('video', 'video')],
    defaultModelId: 'fal-ai/kling-video/o3/pro/lip-sync',
    providerPreference: ['fal-ai'],
    executor: 'fal',
    costEstimate: 10,
    batchPolicy: 'map',
    outputPreviewType: 'video',
  },
  {
    actionId: 'audio.upload',
    nodeKind: 'Upload',
    label: 'Audio Upload',
    description: 'Import an audio asset.',
    mediaType: 'audio',
    workflowType: 'upload',
    inputs: [],
    outputs: [output('audio', 'audio')],
    controls: [{ id: 'file', label: 'File', type: 'file' }],
    providerPreference: ['none'],
    executor: 'passthrough',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: 'audio',
  },
  {
    actionId: 'audio.tts',
    nodeKind: 'Audio',
    label: 'Text to Speech',
    description: 'Generate spoken audio from text.',
    mediaType: 'audio',
    workflowType: 'text-to-audio',
    inputs: [input('prompt', 'text')],
    outputs: [output('audio', 'audio')],
    controls: [
      { id: 'voiceId', label: 'Voice', type: 'text', defaultValue: '' },
      slider('speed', 'Speed', 1, 0.5, 2, 0.05),
    ],
    defaultModelId: 'fal-ai/elevenlabs/tts/turbo-v2.5',
    providerPreference: ['fal-ai', 'edge_function'],
    executor: 'fal',
    costEstimate: 4,
    batchPolicy: 'map',
    outputPreviewType: 'audio',
    defaultParams: { model: 'fal-ai/elevenlabs/tts/turbo-v2.5' },
  },
  {
    actionId: 'audio.separate',
    nodeKind: 'Transform',
    label: 'Audio Separation',
    description: 'Separate or isolate audio stems.',
    mediaType: 'audio',
    workflowType: 'audio-utility',
    inputs: [input('audio', 'audio')],
    outputs: [output('audio', 'audio', { cardinality: 'n' }), output('metadata', 'json', { position: 'bottom' })],
    providerPreference: ['local'],
    executor: 'ffmpeg',
    costEstimate: 0,
    batchPolicy: 'fanOut',
    outputPreviewType: 'audio',
  },
  {
    actionId: 'asset.upload-3d',
    nodeKind: 'Upload',
    label: '3D Upload',
    description: 'Import a 3D model asset.',
    mediaType: '3d',
    workflowType: 'upload',
    inputs: [],
    outputs: [output('model', '3d')],
    controls: [{ id: 'file', label: 'File', type: 'file' }],
    providerPreference: ['none'],
    executor: 'passthrough',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: '3d',
  },
  {
    actionId: 'asset.image-to-3d',
    nodeKind: 'Model',
    label: 'Image to 3D',
    description: 'Generate a 3D model from an image reference.',
    mediaType: '3d',
    workflowType: 'image-to-3d',
    inputs: [input('image', 'image'), input('prompt', 'text', { optional: true })],
    outputs: [output('model', '3d')],
    defaultModelId: 'fal-ai/trellis/multi',
    providerPreference: ['fal-ai'],
    executor: 'fal',
    costEstimate: 8,
    batchPolicy: 'map',
    outputPreviewType: '3d',
    defaultParams: { model: 'fal-ai/trellis/multi' },
  },
  {
    actionId: 'embed.url',
    nodeKind: 'Transform',
    label: 'URL Embed',
    description: 'Embed a URL, browser-agent walkthrough, or external preview.',
    mediaType: 'json',
    workflowType: 'embed',
    inputs: [input('input', 'any', { optional: true })],
    outputs: [output('embed', 'json')],
    controls: [{ id: 'url', label: 'URL', type: 'text', defaultValue: '' }],
    providerPreference: ['none'],
    executor: 'embed',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: 'json',
  },
  {
    actionId: 'embed.editframe',
    nodeKind: 'Transform',
    label: 'Editframe Render',
    description: 'Render an Editframe HTML composition through a server-side action.',
    mediaType: 'video',
    workflowType: 'editframe-render',
    inputs: [input('composition', 'json', { optional: true }), input('assets', 'any', { cardinality: 'n', optional: true })],
    outputs: [output('video', 'video'), output('metadata', 'json', { position: 'bottom' })],
    controls: [
      { id: 'width', label: 'Width', type: 'number', defaultValue: 1920, min: 256, max: 7680, step: 1 },
      { id: 'height', label: 'Height', type: 'number', defaultValue: 1080, min: 256, max: 4320, step: 1 },
      { id: 'fps', label: 'FPS', type: 'number', defaultValue: 30, min: 1, max: 120, step: 1 },
    ],
    providerPreference: ['edge_function'],
    executor: 'embed',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: 'video',
  },
  {
    actionId: 'batch.cartesian',
    nodeKind: 'Combine',
    label: 'Batch x Batch',
    description: 'Run every combination of connected inputs.',
    mediaType: 'json',
    workflowType: 'batch',
    inputs: [input('input', 'any', { cardinality: 'n' })],
    outputs: [output('items', 'json', { cardinality: 'n' })],
    providerPreference: ['local'],
    executor: 'passthrough',
    costEstimate: 0,
    batchPolicy: 'cartesian',
    outputPreviewType: 'json',
    tags: ['batch'],
  },
  {
    actionId: 'output.materialize',
    nodeKind: 'Output',
    label: 'Output',
    description: 'Collect final artifacts.',
    mediaType: 'any',
    workflowType: 'output',
    inputs: [input('input', 'any', { cardinality: 'n' })],
    outputs: [],
    providerPreference: ['none'],
    executor: 'output',
    costEstimate: 0,
    batchPolicy: 'single',
    outputPreviewType: 'json',
  },
];

const DEFAULT_ACTION_BY_KIND: Partial<Record<MediaActionNodeKind, string>> = {
  Text: 'text.enter',
  Prompt: 'text.prompt-generation',
  Image: 'image.generate',
  ImageEdit: 'image.edit',
  Video: 'video.generate',
  Audio: 'audio.tts',
  Upload: 'image.upload',
  Transform: 'image.color-key',
  Combine: 'text.concat',
  Model: 'asset.image-to-3d',
  Output: 'output.materialize',
};

export function getMediaActionById(actionId: string | null | undefined): MediaActionDefinition | undefined {
  if (!actionId) return undefined;
  return MEDIA_ACTIONS.find((action) => action.actionId === actionId);
}

export function getDefaultMediaActionForKind(
  kind: MediaActionNodeKind | string | null | undefined
): MediaActionDefinition | undefined {
  if (!kind) return undefined;
  const actionId = DEFAULT_ACTION_BY_KIND[kind as MediaActionNodeKind];
  return actionId ? getMediaActionById(actionId) : undefined;
}

export function getPaletteMediaActions(): MediaActionDefinition[] {
  const preferred = new Set([
    'text.enter',
    'text.concat',
    'image.generate',
    'image.edit',
    'image.color-key',
    'image.color-grade',
    'video.generate',
    'video.image-to-video',
    'video.extract-frames',
    'video.frame-grid',
    'video.stitch',
    'video.reverse',
    'audio.tts',
    'asset.image-to-3d',
    'embed.url',
    'embed.editframe',
    'batch.cartesian',
    'output.materialize',
  ]);
  return MEDIA_ACTIONS.filter((action) => preferred.has(action.actionId));
}

export function getActionsForSourceDataType(datatype: MediaActionDataType | string | null | undefined) {
  if (!datatype) return getPaletteMediaActions();
  return getPaletteMediaActions().filter((action) => {
    if (action.inputs.length === 0) return true;
    return action.inputs.some((port) => port.datatype === datatype || port.datatype === 'any');
  });
}

export function getActionInputBinding(
  actionId: string | null | undefined,
  handleName: string
): { handle: string; paramKey: string; mode: 'overwrite' | 'append-unique' | 'concat-prompt'; datatype?: MediaActionDataType } | undefined {
  const action = getMediaActionById(actionId);
  const port = action?.inputs.find((candidate) => candidate.name === handleName || candidate.id === handleName);
  if (!port) return undefined;
  return {
    handle: port.name,
    paramKey: port.paramKey ?? port.name,
    mode: port.cardinality === 'n' ? 'append-unique' : 'overwrite',
    datatype: port.datatype,
  };
}

export function getActionDefaults(action: MediaActionDefinition): Record<string, unknown> {
  const controlDefaults = Object.fromEntries(
    (action.controls ?? [])
      .filter((control) => control.defaultValue !== undefined)
      .map((control) => [control.id, control.defaultValue])
  );

  return {
    ...controlDefaults,
    ...(action.defaultModelId ? { model: action.defaultModelId, selectedModels: [action.defaultModelId] } : {}),
    ...(action.defaultParams ?? {}),
    actionId: action.actionId,
    workflowType: action.workflowType,
    batchPolicy: action.batchPolicy,
  };
}

