import type { LyricStyleId } from '@/lib/lyric-styles';

export type AspectRatio = '9:16' | '16:9' | '1:1';
export type RemixJobStatus = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled';
export type RemixRenderStatus = 'queued' | 'rendering' | 'done' | 'failed' | 'cancelled';

export interface FootageCategory {
  id: string;
  parentId: string | null;
  name: string;
  icon: string;
  sort: number;
}

export interface FootageAsset {
  id: string;
  owner: 'system' | string;
  categoryId: string | null;
  title: string;
  source: 'preselected' | 'upload' | 'generated';
  url: string;
  posterUrl: string | null;
  durationMs: number;
  aspectRatio: AspectRatio;
  tags: string[];
  createdAt: string;
}

export interface RemixJob {
  id: string;
  userId: string;
  templateId: string;
  quantity: number;
  lyricStyleId: LyricStyleId;
  scale: number;
  noCuts: boolean;
  clipRatio: 'all' | AspectRatio;
  filter: string;
  shuffleEach: boolean;
  status: RemixJobStatus;
  creditCost: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface RemixRender {
  id: string;
  jobId: string;
  status: RemixRenderStatus;
  remotionRenderId: string | null;
  clipIds: string[];
  outputUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface RemixJobWithRenders {
  job: RemixJob;
  renders: RemixRender[];
}

export interface CreateRemixJobInput {
  templateId: string;
  durationMs: number;
  quantity: number;
  lyricStyleId: LyricStyleId;
  scale: number;
  noCuts: boolean;
  clipRatio: 'all' | AspectRatio;
  filter: string;
  shuffleEach: boolean;
  clipIds?: string[];
  aspectRatio?: AspectRatio;
  timelineClipIds?: Array<string | null>;
}

export interface FootageFilters {
  categoryId?: string | null;
  ratio?: 'all' | AspectRatio;
  filter?: string;
  sort?: 'newest' | 'oldest' | 'shortest' | 'longest';
}

// Timeline slot model
export interface RemixTimelineSlot {
  slotIndex: number;
  startMs: number;
  endMs: number;
  clipId: string | null;
}
