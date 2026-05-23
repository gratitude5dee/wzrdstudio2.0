import { supabase } from '@/integrations/supabase/client';
import { LYRIC_STYLES, type LyricStyle, type LyricStyleId, getLyricStyle } from '@/lib/lyric-styles';
import { pickClipsForDuration, quoteRemixCredits } from '@/lib/remix-utils';
import type {
  CreateRemixJobInput,
  FootageAsset,
  FootageCategory,
  FootageFilters,
  RemixJob,
  RemixJobWithRenders,
  RemixRender,
} from './types';

const fallbackCategories: FootageCategory[] = [
  { id: 'bay-area', parentId: null, name: 'Bay Area', icon: 'Globe2', sort: 10 },
  { id: 'bay-area-8mm', parentId: 'bay-area', name: '8mm', icon: 'Film', sort: 11 },
  { id: 'bay-area-modern', parentId: 'bay-area', name: 'Modern', icon: 'Sparkles', sort: 12 },
  { id: 'bay-area-aerial', parentId: 'bay-area', name: 'Aerial', icon: 'Plane', sort: 13 },
  { id: 'abstract', parentId: null, name: 'Abstract', icon: 'Shapes', sort: 20 },
  { id: 'abstract-loops', parentId: 'abstract', name: 'Loops', icon: 'RefreshCw', sort: 21 },
  { id: 'abstract-glitch', parentId: 'abstract', name: 'Glitch', icon: 'Zap', sort: 22 },
  { id: 'nature', parentId: null, name: 'Nature', icon: 'Waves', sort: 30 },
  { id: 'nature-coast', parentId: 'nature', name: 'Coast', icon: 'Waves', sort: 31 },
  { id: 'nature-forest', parentId: 'nature', name: 'Forest', icon: 'Trees', sort: 32 },
];

const fallbackAssets: FootageAsset[] = [
  {
    id: 'vhs-clip-01',
    owner: 'system',
    categoryId: 'bay-area-8mm',
    title: 'Bay Area Super 8mm night',
    source: 'preselected',
    url: '/clips/bay-area-vhs-01.mp4',
    posterUrl: null,
    durationMs: 17600,
    aspectRatio: '9:16',
    tags: ['8mm', 'Bay Area'],
    createdAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'vhs-clip-19',
    owner: 'system',
    categoryId: 'bay-area-8mm',
    title: 'Bay Area Super 8mm Clip 19',
    source: 'preselected',
    url: '/clips/bay-area-vhs-19.mp4',
    posterUrl: null,
    durationMs: 15000,
    aspectRatio: '9:16',
    tags: ['8mm', 'Bay Area'],
    createdAt: '2026-05-01T00:00:01Z',
  },
  {
    id: 'vhs-clip-03',
    owner: 'system',
    categoryId: 'bay-area-8mm',
    title: 'Bay Area Super 8mm streets',
    source: 'preselected',
    url: '/clips/bay-area-vhs-03.mp4',
    posterUrl: null,
    durationMs: 32900,
    aspectRatio: '9:16',
    tags: ['8mm', 'Bay Area'],
    createdAt: '2026-05-01T00:00:02Z',
  },
  {
    id: 'system-super8-04',
    owner: 'system',
    categoryId: 'bay-area-8mm',
    title: 'Bay Area Super 8mm golden',
    source: 'preselected',
    url: '/clips/bay-area-vhs-01.mp4',
    posterUrl: null,
    durationMs: 17600,
    aspectRatio: '9:16',
    tags: ['8mm', 'Bay Area'],
    createdAt: '2026-05-01T00:00:03Z',
  },
  {
    id: 'system-super8-05',
    owner: 'system',
    categoryId: 'bay-area-8mm',
    title: 'Bay Area Super 8mm dusk',
    source: 'preselected',
    url: '/clips/bay-area-vhs-19.mp4',
    posterUrl: null,
    durationMs: 15000,
    aspectRatio: '9:16',
    tags: ['8mm', 'Bay Area'],
    createdAt: '2026-05-01T00:00:04Z',
  },
  {
    id: 'system-modern-01',
    owner: 'system',
    categoryId: 'bay-area-modern',
    title: 'Modern skyline plate',
    source: 'preselected',
    url: '/clips/bay-area-vhs-03.mp4',
    posterUrl: null,
    durationMs: 32900,
    aspectRatio: '16:9',
    tags: ['Modern', 'Bay Area'],
    createdAt: '2026-05-01T00:00:05Z',
  },
  {
    id: 'system-aerial-01',
    owner: 'system',
    categoryId: 'bay-area-aerial',
    title: 'Aerial haze loop',
    source: 'preselected',
    url: '/clips/bay-area-vhs-01.mp4',
    posterUrl: null,
    durationMs: 17600,
    aspectRatio: '16:9',
    tags: ['Aerial'],
    createdAt: '2026-05-01T00:00:06Z',
  },
  {
    id: 'system-abstract-01',
    owner: 'system',
    categoryId: 'abstract-loops',
    title: 'Abstract motion loop',
    source: 'preselected',
    url: '/clips/bay-area-vhs-03.mp4',
    posterUrl: null,
    durationMs: 32900,
    aspectRatio: '1:1',
    tags: ['Abstract', 'Loops'],
    createdAt: '2026-05-01T00:00:07Z',
  },
  {
    id: 'system-abstract-02',
    owner: 'system',
    categoryId: 'abstract-glitch',
    title: 'Glitch burst',
    source: 'preselected',
    url: '/clips/bay-area-vhs-19.mp4',
    posterUrl: null,
    durationMs: 15000,
    aspectRatio: '9:16',
    tags: ['Abstract', 'Glitch'],
    createdAt: '2026-05-01T00:00:08Z',
  },
  {
    id: 'system-nature-01',
    owner: 'system',
    categoryId: 'nature-coast',
    title: 'Pacific coast waves',
    source: 'preselected',
    url: '/clips/bay-area-vhs-01.mp4',
    posterUrl: null,
    durationMs: 17600,
    aspectRatio: '16:9',
    tags: ['Nature', 'Coast'],
    createdAt: '2026-05-01T00:00:09Z',
  },
  {
    id: 'system-nature-02',
    owner: 'system',
    categoryId: 'nature-forest',
    title: 'Redwood canopy pan',
    source: 'preselected',
    url: '/clips/bay-area-vhs-03.mp4',
    posterUrl: null,
    durationMs: 32900,
    aspectRatio: '16:9',
    tags: ['Nature', 'Forest'],
    createdAt: '2026-05-01T00:00:10Z',
  },
  {
    id: 'system-nature-03',
    owner: 'system',
    categoryId: 'nature-coast',
    title: 'Sunset tide pool',
    source: 'preselected',
    url: '/clips/bay-area-vhs-19.mp4',
    posterUrl: null,
    durationMs: 15000,
    aspectRatio: '9:16',
    tags: ['Nature', 'Coast'],
    createdAt: '2026-05-01T00:00:11Z',
  },
];

type DbRow = Record<string, unknown>;
type DbError = { message?: string } | null;
type QueryResponse<T> = { data: T | null; error: DbError };

type RemixQueryBuilder<TData = DbRow[]> = PromiseLike<QueryResponse<TData>> & {
  select(columns?: string): RemixQueryBuilder<TData>;
  order(column: string, options?: { ascending?: boolean }): RemixQueryBuilder<TData>;
  eq(column: string, value: unknown): RemixQueryBuilder<TData>;
  contains(column: string, value: unknown): RemixQueryBuilder<TData>;
  limit(count: number): RemixQueryBuilder<TData>;
  insert(values: unknown): RemixQueryBuilder<TData>;
  update(values: unknown): RemixQueryBuilder<TData>;
  single(): RemixQueryBuilder<DbRow>;
  maybeSingle(): RemixQueryBuilder<DbRow | null>;
};

type RemixSupabaseClient = {
  from(table: string): RemixQueryBuilder;
};

const remixDb = supabase as unknown as RemixSupabaseClient;

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function rowArray(value: unknown): DbRow[] {
  return Array.isArray(value) ? (value as DbRow[]) : [];
}

function styleSpec(value: unknown): Partial<LyricStyle> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<LyricStyle>)
    : {};
}

function mapCategory(row: DbRow): FootageCategory {
  return {
    id: stringValue(row.id),
    parentId: nullableString(row.parent_id),
    name: stringValue(row.name, 'Untitled'),
    icon: stringValue(row.icon, stringValue(row.emoji, 'Film')),
    sort: numberValue(row.sort),
  };
}

function mapAsset(row: DbRow): FootageAsset {
  return {
    id: stringValue(row.id),
    owner: stringValue(row.owner, 'system'),
    categoryId: nullableString(row.category_id),
    title: stringValue(row.title, 'Untitled clip'),
    source: stringValue(row.source, 'preselected') as FootageAsset['source'],
    url: stringValue(row.url),
    posterUrl: nullableString(row.poster_url) ?? nullableString(row.thumbnail_url),
    durationMs: numberValue(row.duration_ms, 6000),
    aspectRatio: stringValue(row.aspect_ratio, '9:16') as FootageAsset['aspectRatio'],
    tags: stringArray(row.tags),
    createdAt: stringValue(row.created_at, new Date().toISOString()),
  };
}

function mapJob(row: DbRow): RemixJob {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    templateId: stringValue(row.template_id),
    quantity: numberValue(row.quantity, 1),
    lyricStyleId: getLyricStyle(stringValue(row.lyric_style_id, 'default')).id as LyricStyleId,
    scale: numberValue(row.scale, 0.65),
    noCuts: booleanValue(row.no_cuts),
    clipRatio: stringValue(row.clip_ratio, 'all') as RemixJob['clipRatio'],
    filter: stringValue(row.filter, 'all'),
    shuffleEach: booleanValue(row.shuffle_each),
    status: stringValue(row.status, 'queued') as RemixJob['status'],
    creditCost: numberValue(row.credit_cost),
    createdAt: stringValue(row.created_at, new Date().toISOString()),
    updatedAt: nullableString(row.updated_at),
  };
}

function mapRender(row: DbRow): RemixRender {
  return {
    id: stringValue(row.id),
    jobId: stringValue(row.job_id),
    status: stringValue(row.status, 'queued') as RemixRender['status'],
    remotionRenderId: nullableString(row.remotion_render_id),
    clipIds: stringArray(row.clip_ids),
    outputUrl: nullableString(row.output_url),
    thumbnailUrl: nullableString(row.thumbnail_url),
    error: nullableString(row.error),
    progress: numberValue(row.progress),
    createdAt: stringValue(row.created_at, new Date().toISOString()),
    updatedAt: nullableString(row.updated_at),
  };
}

export async function listLyricStyles(): Promise<LyricStyle[]> {
  try {
    const { data, error } = await remixDb
      .from('lyric_styles')
      .select('id, name, spec_json')
      .order('sort', { ascending: true });
    if (error) throw error;
    const rows = rowArray(data);
    if (rows.length > 0) {
      return rows.map((row) => ({ ...getLyricStyle(stringValue(row.id, 'default')), ...styleSpec(row.spec_json) }));
    }
  } catch (error) {
    console.warn('[remix] falling back to local lyric styles', error);
  }
  return LYRIC_STYLES;
}

export async function listFootageCategories(): Promise<FootageCategory[]> {
  try {
    const { data, error } = await remixDb
      .from('footage_categories')
      .select('id, parent_id, name, icon, sort')
      .order('sort', { ascending: true });
    if (error) throw error;
    const rows = rowArray(data);
    if (rows.length > 0) return rows.map(mapCategory);
  } catch (error) {
    console.warn('[remix] falling back to local footage categories', error);
  }
  return fallbackCategories;
}

export async function listFootageAssets(filters: FootageFilters = {}): Promise<FootageAsset[]> {
  try {
    let query = remixDb
      .from('footage_assets')
      .select('id, owner, category_id, title, source, url, poster_url, duration_ms, aspect_ratio, tags, created_at');
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.ratio && filters.ratio !== 'all') query = query.eq('aspect_ratio', filters.ratio);
    if (filters.filter && filters.filter !== 'all') query = query.contains('tags', [filters.filter]);
    if (filters.sort === 'oldest') query = query.order('created_at', { ascending: true });
    else if (filters.sort === 'shortest') query = query.order('duration_ms', { ascending: true });
    else if (filters.sort === 'longest') query = query.order('duration_ms', { ascending: false });
    else query = query.order('created_at', { ascending: false });
    const { data, error } = await query.limit(100);
    if (error) throw error;
    const rows = rowArray(data);
    if (rows.length > 0) return rows.map(mapAsset);
  } catch (error) {
    console.warn('[remix] falling back to local footage assets', error);
  }

  let out = fallbackAssets;
  if (filters.categoryId) out = out.filter((asset) => asset.categoryId === filters.categoryId);
  if (filters.ratio && filters.ratio !== 'all') out = out.filter((asset) => asset.aspectRatio === filters.ratio);
  if (filters.filter && filters.filter !== 'all') {
    const needle = filters.filter.toLowerCase();
    out = out.filter((asset) => asset.tags.some((tag) => tag.toLowerCase() === needle));
  }
  if (filters.sort === 'shortest') out = [...out].sort((a, b) => a.durationMs - b.durationMs);
  else if (filters.sort === 'longest') out = [...out].sort((a, b) => b.durationMs - a.durationMs);
  else if (filters.sort === 'oldest') out = [...out].reverse();
  return out;
}

export async function resolveTemplateAudioUrl(sourceAudioAssetId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_assets')
    .select('url')
    .eq('id', sourceAudioAssetId)
    .maybeSingle();
  if (error) {
    console.warn('[remix] could not resolve audio asset', error);
    return null;
  }
  return (data?.url as string | undefined) ?? null;
}

export async function createRemixJob(input: CreateRemixJobInput): Promise<RemixJobWithRenders> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to export');

  const creditCost = quoteRemixCredits(input.durationMs, input.quantity);
  const { data: enoughCredits, error } = await supabase.rpc('use_credits', {
    resource_type: 'video',
    credit_cost: creditCost,
    metadata: {
      source: 'kanvas-remix',
      templateId: input.templateId,
      quantity: input.quantity,
    },
  });
  if (error) throw error;
  if (enoughCredits === false) throw new Error('Not enough credits available');

  const assets = input.clipIds?.length
    ? (await listFootageAssets()).filter((asset) => input.clipIds?.includes(asset.id))
    : await listFootageAssets({
        ratio: input.clipRatio,
        filter: input.filter,
        sort: 'newest',
      });

  const { data: jobRow, error: jobError } = await remixDb
    .from('remix_jobs')
    .insert({
      user_id: user.id,
      template_id: input.templateId,
      quantity: input.quantity,
      lyric_style_id: input.lyricStyleId,
      scale: input.scale,
      no_cuts: input.noCuts,
      clip_ratio: input.clipRatio,
      filter: input.filter,
      shuffle_each: input.shuffleEach,
      status: 'done',
      credit_cost: creditCost,
    })
    .select('*')
    .single();

  if (jobError) {
    console.warn('[remix] job table unavailable, using local fallback', jobError);
    return createLocalRemixJob(user.id, input, assets, creditCost);
  }

  const job = mapJob(jobRow);
  const renderRows = Array.from({ length: input.quantity }).map((_, index) => {
    const clips = pickClipsForDuration(assets, input.durationMs, Date.now() + index + 1);
    return {
      job_id: job.id,
      status: 'done',
      clip_ids: clips.map((clip) => clip.id),
      output_url: clips[0]?.url ?? assets[0]?.url ?? null,
      thumbnail_url: clips[0]?.posterUrl ?? assets[0]?.posterUrl ?? null,
      progress: 1,
    };
  });

  const { data: rendersData, error: rendersError } = await remixDb
    .from('remix_renders')
    .insert(renderRows)
    .select('*');
  if (rendersError) throw new Error(rendersError.message);

  return { job, renders: rowArray(rendersData).map(mapRender) };
}

export async function getRemixJob(jobId: string): Promise<RemixJobWithRenders> {
  const { data: jobRow, error: jobError } = await remixDb
    .from('remix_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !jobRow) {
    const fallback = readLocalRemixJob(jobId);
    if (fallback) return fallback;
    throw new Error(jobError?.message ?? 'Remix job not found');
  }

  const { data: renderRows, error: rendersError } = await remixDb
    .from('remix_renders')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (rendersError) throw new Error(rendersError.message);
  return { job: mapJob(jobRow), renders: rowArray(renderRows).map(mapRender) };
}

export async function cancelRemixJob(jobId: string): Promise<void> {
  const { error } = await remixDb
    .from('remix_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId);
  if (error) {
    const fallback = readLocalRemixJob(jobId);
    if (fallback) {
      writeLocalRemixJob({ ...fallback, job: { ...fallback.job, status: 'cancelled' } });
      return;
    }
    throw new Error(error.message);
  }
}

export async function retryRemixRender(renderId: string): Promise<void> {
  const { error } = await remixDb
    .from('remix_renders')
    .update({ status: 'done', progress: 1, error: null })
    .eq('id', renderId);
  if (error) throw new Error(error.message);
}

function createLocalRemixJob(
  userId: string,
  input: CreateRemixJobInput,
  assets: FootageAsset[],
  creditCost: number
): RemixJobWithRenders {
  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const job: RemixJob = {
    id: jobId,
    userId,
    templateId: input.templateId,
    quantity: input.quantity,
    lyricStyleId: input.lyricStyleId,
    scale: input.scale,
    noCuts: input.noCuts,
    clipRatio: input.clipRatio,
    filter: input.filter,
    shuffleEach: input.shuffleEach,
    status: 'done',
    creditCost,
    createdAt: now,
    updatedAt: now,
  };
  const renders: RemixRender[] = Array.from({ length: input.quantity }).map((_, index) => {
    const clips = pickClipsForDuration(assets, input.durationMs, Date.now() + index + 1);
    return {
      id: crypto.randomUUID(),
      jobId,
      status: 'done',
      remotionRenderId: null,
      clipIds: clips.map((clip) => clip.id),
      outputUrl: clips[0]?.url ?? null,
      thumbnailUrl: clips[0]?.posterUrl ?? null,
      error: null,
      progress: 1,
      createdAt: now,
      updatedAt: now,
    };
  });
  const result = { job, renders };
  writeLocalRemixJob(result);
  return result;
}

function readLocalRemixJob(jobId: string): RemixJobWithRenders | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(`kanvas-remix-job:${jobId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RemixJobWithRenders;
  } catch {
    return null;
  }
}

function writeLocalRemixJob(job: RemixJobWithRenders) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`kanvas-remix-job:${job.job.id}`, JSON.stringify(job));
}
