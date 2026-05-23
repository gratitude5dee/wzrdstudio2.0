import {
  Film,
  Image as ImageIcon,
  Layers,
  Merge,
  Music,
  Plus,
  Scissors,
  Type,
  Video,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { StudioNodeType, StudioNodeSeedOptions } from '@/hooks/studio/useStudioGraphActions';

export interface StudioNodePaletteItem {
  /** Unique key for the palette entry (defaults to type if not set). */
  key?: string;
  type: StudioNodeType;
  icon: LucideIcon;
  label: string;
  shortcut: string;
  colorClassName: string;
  description: string;
  /** Optional category grouping shown as a section header before this item. */
  group?: string;
  /** Seed options applied when creating this node (e.g. pre-selected model). */
  seed?: StudioNodeSeedOptions;
}

/* ------------------------------------------------------------------ */
/*  Core generator nodes                                               */
/* ------------------------------------------------------------------ */

export const CORE_PALETTE_ITEMS: StudioNodePaletteItem[] = [
  {
    type: 'text',
    icon: Type,
    label: 'Text',
    shortcut: 'T',
    colorClassName: 'text-[#d4a574]',
    description: 'Draft prompts, analyze references, and stream LLM outputs.',
  },
  {
    type: 'image',
    icon: ImageIcon,
    label: 'Image',
    shortcut: 'I',
    colorClassName: 'text-[#f97316]',
    description: 'Generate or transform still images with attached references.',
  },
  {
    type: 'imageEdit',
    icon: Layers,
    label: 'Image Edit',
    shortcut: 'E',
    colorClassName: 'text-[#A0AA32]',
    description: 'Composite layers, inpaint selections, and build final artifacts.',
  },
  {
    type: 'video',
    icon: Video,
    label: 'Video',
    shortcut: 'V',
    colorClassName: 'text-[#B85050]',
    description: 'Create motion outputs from prompts and upstream visual context.',
  },
  {
    type: 'audio',
    icon: Music,
    label: 'Audio',
    shortcut: 'A',
    colorClassName: 'text-[#EC4899]',
    description: 'Generate speech, sound effects, or music from text prompts.',
  },
];

/* ------------------------------------------------------------------ */
/*  FFmpeg processing nodes                                            */
/* ------------------------------------------------------------------ */

export const FFMPEG_PALETTE_ITEMS: StudioNodePaletteItem[] = [
  {
    key: 'ffmpeg-trim',
    type: 'video',
    icon: Scissors,
    label: 'Trim Video',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Trim a video to a selected start/end time range.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Trim Video',
      params: { model: 'fal-ai/workflow-utilities/trim-video', selectedModels: ['fal-ai/workflow-utilities/trim-video'] },
    },
  },
  {
    key: 'ffmpeg-merge-videos',
    type: 'video',
    icon: Merge,
    label: 'Merge Videos',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Concatenate two or more video files into one.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Merge Videos',
      params: { model: 'fal-ai/ffmpeg-api/merge-videos', selectedModels: ['fal-ai/ffmpeg-api/merge-videos'] },
    },
  },
  {
    key: 'ffmpeg-merge-av',
    type: 'video',
    icon: Film,
    label: 'Merge Audio+Video',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Combine separate audio and video tracks into one file.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Merge Audio+Video',
      params: { model: 'fal-ai/ffmpeg-api/merge-audio-video', selectedModels: ['fal-ai/ffmpeg-api/merge-audio-video'] },
    },
  },
  {
    key: 'ffmpeg-extract-frame',
    type: 'video',
    icon: ImageIcon,
    label: 'Extract Frame',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Extract a single frame (first/middle/last) from a video.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Extract Frame',
      params: { model: 'fal-ai/ffmpeg-api/extract-frame', selectedModels: ['fal-ai/ffmpeg-api/extract-frame'] },
    },
  },
  {
    key: 'ffmpeg-scale',
    type: 'video',
    icon: Wand2,
    label: 'Scale Video',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Resize a video to target width and height.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Scale Video',
      params: { model: 'fal-ai/workflow-utilities/scale-video', selectedModels: ['fal-ai/workflow-utilities/scale-video'] },
    },
  },
  {
    key: 'ffmpeg-reverse',
    type: 'video',
    icon: Video,
    label: 'Reverse Video',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Reverse the playback direction of a video.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Reverse Video',
      params: { model: 'fal-ai/workflow-utilities/reverse-video', selectedModels: ['fal-ai/workflow-utilities/reverse-video'] },
    },
  },
  {
    key: 'ffmpeg-compose',
    type: 'video',
    icon: Layers,
    label: 'FFmpeg Compose',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Compose a timeline from multiple video, image, and audio inputs.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'FFmpeg Compose',
      params: { model: 'fal-ai/ffmpeg-api/compose', selectedModels: ['fal-ai/ffmpeg-api/compose'] },
    },
  },
  {
    key: 'ffmpeg-blend',
    type: 'video',
    icon: Merge,
    label: 'Blend Video',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Blend two videos together into a single output.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Blend Video',
      params: { model: 'fal-ai/workflow-utilities/blend-video', selectedModels: ['fal-ai/workflow-utilities/blend-video'] },
    },
  },
  {
    key: 'ffmpeg-interleave',
    type: 'video',
    icon: Film,
    label: 'Interleave Video',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Interleave frames from multiple video sources.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Interleave Video',
      params: { model: 'fal-ai/workflow-utilities/interleave-video', selectedModels: ['fal-ai/workflow-utilities/interleave-video'] },
    },
  },
  {
    key: 'ffmpeg-extract-nth',
    type: 'video',
    icon: ImageIcon,
    label: 'Extract Nth Frame',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Extract every Nth frame from a video as images.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Extract Nth Frame',
      params: { model: 'fal-ai/workflow-utilities/extract-nth-frame', selectedModels: ['fal-ai/workflow-utilities/extract-nth-frame'] },
    },
  },
  {
    key: 'ffmpeg-metadata',
    type: 'video',
    icon: Type,
    label: 'FFmpeg Metadata',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Inspect media encoding metadata (codec, duration, etc.).',
    group: 'FFmpeg Processing',
    seed: {
      label: 'FFmpeg Metadata',
      params: { model: 'fal-ai/ffmpeg-api/metadata', selectedModels: ['fal-ai/ffmpeg-api/metadata'] },
    },
  },
  {
    key: 'ffmpeg-merge-audios',
    type: 'audio',
    icon: Music,
    label: 'Merge Audios',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Merge multiple audio tracks into a single file.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Merge Audios',
      params: { model: 'fal-ai/ffmpeg-api/merge-audios', selectedModels: ['fal-ai/ffmpeg-api/merge-audios'] },
    },
  },
  {
    key: 'ffmpeg-loudnorm',
    type: 'audio',
    icon: Music,
    label: 'Loudness Normalize',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Normalize audio loudness to EBU R128 broadcast standard.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Loudness Normalize',
      params: { model: 'fal-ai/ffmpeg-api/loudnorm', selectedModels: ['fal-ai/ffmpeg-api/loudnorm'] },
    },
  },
  {
    key: 'ffmpeg-waveform',
    type: 'audio',
    icon: Music,
    label: 'Waveform',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Extract and visualize an audio waveform.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Waveform',
      params: { model: 'fal-ai/ffmpeg-api/waveform', selectedModels: ['fal-ai/ffmpeg-api/waveform'] },
    },
  },
  {
    key: 'ffmpeg-compressor',
    type: 'audio',
    icon: Music,
    label: 'Audio Compressor',
    shortcut: '',
    colorClassName: 'text-[#8B5CF6]',
    description: 'Apply dynamic range compression to an audio track.',
    group: 'FFmpeg Processing',
    seed: {
      label: 'Audio Compressor',
      params: { model: 'fal-ai/workflow-utilities/audio-compressor', selectedModels: ['fal-ai/workflow-utilities/audio-compressor'] },
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Combined list                                                      */
/* ------------------------------------------------------------------ */

export const STUDIO_NODE_PALETTE_ITEMS: StudioNodePaletteItem[] = [
  ...CORE_PALETTE_ITEMS,
  ...FFMPEG_PALETTE_ITEMS,
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface StudioNodePaletteProps {
  onCreateNode: (type: StudioNodeType, seed?: StudioNodeSeedOptions) => void;
  variant?: 'menu' | 'panel';
  className?: string;
}

export function StudioNodePalette({
  onCreateNode,
  variant = 'panel',
  className,
}: StudioNodePaletteProps) {
  if (variant === 'menu') {
    return (
      <div
        className={cn(
          'max-h-[420px] w-52 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-[#141414]/98 shadow-2xl shadow-black/50 backdrop-blur-2xl',
          className
        )}
      >
        <div className="space-y-0.5 p-1.5">
          {STUDIO_NODE_PALETTE_ITEMS.map((item, index) => {
            const isFirstInGroup =
              item.group && (index === 0 || STUDIO_NODE_PALETTE_ITEMS[index - 1]?.group !== item.group);
            return (
              <div key={item.key ?? item.type}>
                {isFirstInGroup ? (
                  <div className="px-2.5 pb-1 pt-2.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    {item.group}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => item.seed ? onCreateNode(item.type, item.seed) : onCreateNode(item.type)}
                  title={item.description}
                  className="group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#1b1b1b]"
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon className={cn('h-4 w-4 transition-colors', item.colorClassName)} />
                    <span className="text-sm text-white">{item.label}</span>
                  </div>
                  {item.shortcut ? (
                    <span className="rounded bg-[#1b1b1b] px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors group-hover:bg-[#222222] group-hover:text-zinc-300">
                      {item.shortcut}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  let lastGroup: string | undefined;

  return (
    <div className={cn('space-y-3', className)}>
      {STUDIO_NODE_PALETTE_ITEMS.map((item) => {
        const showHeader = item.group && item.group !== lastGroup;
        if (item.group) {
          lastGroup = item.group;
        }

        return (
          <div key={item.key ?? item.type}>
            {showHeader ? (
              <div className="pb-1 pt-3 text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                {item.group}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => item.seed ? onCreateNode(item.type, item.seed) : onCreateNode(item.type)}
              title={item.description}
              className="group flex w-full items-center gap-4 rounded-[22px] border border-white/10 bg-[#131313] p-4 text-left transition-colors hover:border-white/15 hover:bg-[#171717]"
            >
              <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-white/10 bg-[#1A1A1A]">
                <item.icon className={cn('h-5 w-5', item.colorClassName)} />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{item.label}</span>
                  {item.shortcut ? (
                    <span className="rounded-full border border-white/8 bg-[#1A1A1A] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      {item.shortcut}
                    </span>
                  ) : null}
                </div>
                <div className="text-sm leading-5 text-zinc-400">{item.description}</div>
              </div>

              <div className="flex h-10 flex-none items-center gap-1 rounded-full border border-white/10 bg-[#1A1A1A] px-3 text-[11px] font-medium text-zinc-200 transition-colors group-hover:border-white/15 group-hover:bg-[#202020]">
                <Plus className="h-3.5 w-3.5" />
                <span>Create</span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default StudioNodePalette;
