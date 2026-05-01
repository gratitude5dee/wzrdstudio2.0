import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Clapperboard,
  Download,
  Film,
  Filter,
  Grid2X2,
  GripVertical,
  HelpCircle,
  Import,
  Info,
  Loader2,
  Music2,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { getTemplate, listTemplates } from '@/features/kanvas-lyrics/service';
import type { KanvasLyricTemplate } from '@/features/kanvas-lyrics/types';
import {
  createRemixJob,
  listFootageAssets,
  listFootageCategories,
  listLyricStyles,
  resolveTemplateAudioUrl,
} from '@/features/remix/service';
import type { AspectRatio, FootageAsset, FootageCategory, RemixTimelineSlot } from '@/features/remix/types';
import type { LyricStyle, LyricStyleId } from '@/lib/lyric-styles';
import { LYRIC_STYLES } from '@/lib/lyric-styles';
import {
  buildRemixTimelineSlots,
  assignClipToSlot,
  lyricBlocksToCaptions,
  quoteRemixCredits,
  seededShuffle,
} from '@/lib/remix-utils';
import { LyricRemixComposition } from '@/components/remix/LyricRemixComposition';

type RatioFilter = 'all' | AspectRatio;
type SortKey = 'newest' | 'oldest' | 'shortest' | 'longest';

const DEFAULT_SCALE = 0.65;

function fmtTime(ms: number) {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

const KanvasRemix = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId?: string }>();
  const playerRef = useRef<PlayerRef>(null);
  const [templates, setTemplates] = useState<KanvasLyricTemplate[]>([]);
  const [template, setTemplate] = useState<KanvasLyricTemplate | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [categories, setCategories] = useState<FootageCategory[]>([]);
  const [assets, setAssets] = useState<FootageAsset[]>([]);
  const [styles, setStyles] = useState<LyricStyle[]>(LYRIC_STYLES);
  const [selectedStyleId, setSelectedStyleId] = useState<LyricStyleId>('default');
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [clipRatio, setClipRatio] = useState<RatioFilter>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [categoryId, setCategoryId] = useState<string | null>('bay-area-8mm');
  const [noCuts, setNoCuts] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [shuffleEach, setShuffleEach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [timelineSlots, setTimelineSlots] = useState<RemixTimelineSlot[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameMs, setCurrentFrameMs] = useState(0);

  // Data loading
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listTemplates({ status: 'saved', limit: 100 }).catch(() => []),
      listFootageCategories(),
      listLyricStyles(),
    ])
      .then(async ([templateRows, categoryRows, styleRows]) => {
        if (cancelled) return;
        setTemplates(templateRows);
        setCategories(categoryRows);
        setStyles(styleRows);
        const activeTemplate =
          templateId
            ? await getTemplate(templateId).catch(() => null)
            : templateRows[0] ?? null;
        if (cancelled) return;
        setTemplate(activeTemplate);
        if (!templateId && activeTemplate) {
          navigate(`/kanvas/remix/${activeTemplate.id}`, { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [navigate, templateId]);

  // Resolve audio URL
  useEffect(() => {
    let cancelled = false;
    if (!template) { setAudioUrl(null); return; }
    resolveTemplateAudioUrl(template.sourceAudioAssetId).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => { cancelled = true; };
  }, [template]);

  // Load assets
  useEffect(() => {
    let cancelled = false;
    listFootageAssets({ categoryId, ratio: clipRatio, filter: tagFilter, sort }).then((rows) => {
      if (!cancelled) setAssets(rows);
    });
    return () => { cancelled = true; };
  }, [categoryId, clipRatio, tagFilter, sort]);

  // Build timeline slots when template changes
  const durationMs = template?.selectionDurationMs ?? 15000;
  useEffect(() => {
    const markers = template?.cutMarkers ?? [];
    const slots = buildRemixTimelineSlots(durationMs, markers);
    setTimelineSlots(slots);
  }, [template, durationMs]);

  const captions = useMemo(() => (template ? lyricBlocksToCaptions(template.lyricBlocks) : []), [template]);
  const creditCost = quoteRemixCredits(durationMs, quantity);
  const selectedStyle = styles.find((style) => style.id === selectedStyleId) ?? LYRIC_STYLES[0];
  const rootCategory = categories.find((category) => category.id === 'bay-area');
  const activeCategory = categories.find((category) => category.id === categoryId);

  const filledSlotCount = timelineSlots.filter((s) => s.clipId !== null).length;
  const totalSlots = timelineSlots.length;

  // Build background clips array from timeline slots
  const backgroundClips = useMemo(() => {
    const clips: FootageAsset[] = [];
    for (const slot of timelineSlots) {
      if (slot.clipId) {
        const asset = assets.find((a) => a.id === slot.clipId);
        if (asset) clips.push(asset);
      }
    }
    return clips.length > 0 ? clips : assets.slice(0, Math.max(1, totalSlots));
  }, [timelineSlots, assets, totalSlots]);

  // Add clip to next empty slot
  const addClipToTimeline = useCallback((clip: FootageAsset) => {
    setTimelineSlots((prev) => {
      const emptyIdx = prev.findIndex((s) => s.clipId === null);
      if (emptyIdx === -1) return prev;
      return assignClipToSlot(prev, emptyIdx, clip.id);
    });
  }, []);

  const removeClipFromSlot = useCallback((slotIndex: number) => {
    setTimelineSlots((prev) => assignClipToSlot(prev, slotIndex, null));
  }, []);

  const shuffleClips = useCallback(() => {
    const base = assets.length > 0 ? assets : [];
    const shuffled = seededShuffle(base, Date.now());
    setTimelineSlots((prev) =>
      prev.map((slot, i) => ({
        ...slot,
        clipId: shuffled[i % shuffled.length]?.id ?? null,
      }))
    );
    setShuffleEach(quantity > 1);
  }, [assets, quantity]);

  // Player transport controls
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) {
      p.pause();
      setIsPlaying(false);
    } else {
      p.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const replay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(0);
    p.play();
    setIsPlaying(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay]);

  // Frame tracking
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const interval = setInterval(() => {
      const frame = p.getCurrentFrame();
      setCurrentFrameMs(Math.round((frame / 30) * 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [template]);

  const startExport = async () => {
    if (!template) return;
    setExporting(true);
    try {
      const job = await createRemixJob({
        templateId: template.id,
        durationMs,
        quantity,
        lyricStyleId: selectedStyleId,
        scale,
        noCuts,
        clipRatio,
        filter: tagFilter,
        shuffleEach,
        clipIds: timelineSlots.filter((s) => s.clipId).map((s) => s.clipId!),
        aspectRatio,
        timelineClipIds: timelineSlots.map((s) => s.clipId),
      });
      toast.success('Remix export started');
      navigate(`/kanvas/remix/jobs/${job.job.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start export');
    } finally {
      setExporting(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-black px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-5xl font-black tracking-tight text-cyan-300">Remix</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Pick a saved lyric template to start building beat-synced short-form videos.
          </p>
          <div className="mt-8 rounded-2xl border border-dashed border-cyan-400/20 bg-[#0A0D14] p-10 text-center">
            <Music2 className="mx-auto h-8 w-8 text-cyan-300" />
            <p className="mt-4 text-sm font-bold text-white">No saved lyric templates</p>
            <button
              type="button"
              onClick={() => navigate('/kanvas/lyrics/new')}
              className="mt-5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black"
            >
              Create template
            </button>
          </div>
        </div>
      </div>
    );
  }

  const scrubPercent = durationMs > 0 ? (currentFrameMs / durationMs) * 100 : 0;
  const cutMarkerPcts = (template.cutMarkers ?? []).map((m) =>
    durationMs > 0 ? (m.timestampMs / durationMs) * 100 : 0
  );

  return (
    <div className="min-h-screen overflow-hidden bg-black text-white">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[480px_1fr]">
        {/* ── Left rail ── */}
        <aside className="flex flex-col border-r border-cyan-400/10 bg-[#030507]">
          <div className="px-8 pt-6">
            <div className="flex items-center gap-2">
              <h1 className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-3xl font-black tracking-tight text-transparent">
                Remix
              </h1>
              <HelpCircle className="h-4 w-4 text-slate-500" />
            </div>
            <p className="mt-1.5 max-w-md text-xs leading-5 text-slate-400">
              Build beat-synced videos from your clip library. Pick a template, shuffle your clips, and export.
            </p>
          </div>

          {/* Clip library */}
          <section className="flex-1 overflow-y-auto px-8 pt-5">
            <div className="flex items-center justify-between border-b border-cyan-400/10 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-200">
                <Film className="h-4 w-4 text-cyan-300" />
                Clip Library
                <span className="text-slate-500">{assets.length}</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-cyan-300">
                <Import className="h-3.5 w-3.5" />
                Import
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={() => toast.info('Imported footage will be persisted in the next storage pass')}
                />
              </label>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                <button type="button" onClick={() => setCategoryId(null)} className="hover:text-cyan-200">All</button>
                <span>/</span>
                <button type="button" onClick={() => setCategoryId(rootCategory?.id ?? null)} className="truncate hover:text-cyan-200">
                  {rootCategory?.name ?? 'Bay Area'}
                </button>
                <span>/</span>
                <span className="font-bold text-slate-200">{activeCategory?.name ?? 'All'}</span>
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-white/10 bg-[#0B0E13] px-2 py-1 text-[11px] text-white outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="shortest">Shortest</option>
                <option value="longest">Longest</option>
              </select>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => addClipToTimeline(asset)}
                  className="group min-w-0 text-left"
                >
                  <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-cyan-400/10 bg-[#0D1117]">
                    {asset.posterUrl ? (
                      <img src={asset.posterUrl} alt="" className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    ) : (
                      <video src={asset.url} muted className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    )}
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      ⏱{(asset.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-slate-400 group-hover:text-white">{asset.title}</p>
                </button>
              ))}
            </div>

            {/* Controls */}
            <section className="mt-4 border-t border-cyan-400/10 pt-3">
              <button
                type="button"
                onClick={() => setControlsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-slate-200"
              >
                <span className="inline-flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-cyan-300" />
                  Controls
                </span>
                <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', !controlsOpen && '-rotate-90')} />
              </button>

              {controlsOpen && (
                <div className="mt-3 space-y-3 pb-6">
                  <ControlLabel label="Template" />
                  <select
                    value={template.id}
                    onChange={(e) => navigate(`/kanvas/remix/${e.target.value}`)}
                    className="w-full rounded-lg border border-cyan-400/40 bg-[#081019] px-3 py-2 text-sm text-white outline-none"
                  >
                    {templates.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title} ⏱ {Math.round(row.selectionDurationMs / 1000)}s ▦ {row.cutMarkers.length}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-slate-500">
                      <X className="h-3 w-3" />
                      No cuts
                      <HelpCircle className="h-3 w-3 text-slate-600" />
                    </span>
                    <Switch checked={noCuts} onCheckedChange={setNoCuts} />
                  </div>

                  <ControlLabel label="Lyric Style" />
                  <div className="grid grid-cols-8 gap-1.5">
                    {styles.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setSelectedStyleId(style.id as LyricStyleId)}
                        className={cn(
                          'flex h-14 flex-col items-center justify-center rounded-lg border bg-black text-[8px] transition-colors',
                          selectedStyleId === style.id
                            ? 'border-cyan-300 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.25)]'
                            : 'border-white/10 text-slate-500 hover:border-cyan-400/40'
                        )}
                      >
                        <span
                          className="text-[12px] font-black leading-tight"
                          style={{
                            color: style.accentFill ?? style.fill,
                            fontFamily: style.font,
                            WebkitTextStroke: style.stroke ? `1px ${style.stroke}` : undefined,
                            textShadow: style.shadow?.replace(/\d+px/g, (m) => `${Math.max(1, parseInt(m) / 4)}px`),
                            background: style.background,
                            padding: style.background ? '1px 3px' : undefined,
                            borderRadius: style.background ? '2px' : undefined,
                            textTransform: style.id === 'brat' ? 'lowercase' : 'uppercase',
                          }}
                        >
                          {style.id === 'none' ? '—' : style.id === 'default' ? '+' : 'THE'}
                        </span>
                        <span className="mt-0.5">{style.name}</span>
                      </button>
                    ))}
                  </div>

                  <ControlLabel label={`Scale: ${scale.toFixed(2)}x`} />
                  <Slider min={0.4} max={1.4} step={0.05} value={[scale]} onValueChange={(v) => setScale(v[0] ?? DEFAULT_SCALE)} />

                  <ControlLabel label="Clip Ratio" />
                  <SelectLike value={clipRatio} onChange={(v) => setClipRatio(v as RatioFilter)} options={['all', '9:16', '1:1', '16:9']} labels={{ all: 'All Ratios' }} icon={<Grid2X2 className="h-4 w-4" />} />

                  <ControlLabel label="Filter" />
                  <SelectLike value={tagFilter} onChange={setTagFilter} options={['all', '8mm', 'Modern', 'Aerial', 'Abstract', 'Nature']} labels={{ all: 'All' }} icon={<Filter className="h-4 w-4" />} />

                  {/* Progress bar */}
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300"
                        style={{ width: `${Math.min(100, (filledSlotCount / Math.max(1, totalSlots)) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-emerald-300">
                      {filledSlotCount}/{totalSlots}
                    </p>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={shuffleClips}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-400/15"
                    >
                      <Shuffle className="h-4 w-4" />
                      Shuffle
                    </button>
                    <div className="flex items-center rounded-lg border border-white/10 bg-[#0B0E13]">
                      <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-slate-300">-</button>
                      <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                      <button type="button" onClick={() => setQuantity((q) => Math.min(10, q + 1))} className="px-3 py-2 text-slate-300">+</button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={exporting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-black text-black shadow-[0_0_22px_rgba(34,211,238,0.24)] disabled:opacity-60"
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Export
                    <span className="rounded-full bg-black/20 px-2 py-0.5">◈ {creditCost}</span>
                  </button>
                </div>
              )}
            </section>
          </section>
        </aside>

        {/* ── Right canvas ── */}
        <main className="relative flex min-h-screen flex-col bg-black">
          {/* Aspect ratio toggle */}
          <div className="absolute right-6 top-2 z-10 inline-flex overflow-hidden rounded-lg border border-white/10 bg-[#0B0E13] text-xs font-bold">
            {(['16:9', '9:16'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={cn('px-4 py-2', aspectRatio === ratio ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-400')}
              >
                {ratio}
              </button>
            ))}
          </div>

          {/* Preview player */}
          <div className="flex flex-1 items-center justify-center px-6 pt-10">
            <div className={cn(
              'relative overflow-hidden rounded-xl border border-white/10 bg-[#050505]',
              aspectRatio === '9:16' ? 'h-[560px] w-[315px]' : 'h-[400px] w-[710px]'
            )}>
              <Player
                ref={playerRef}
                component={LyricRemixComposition}
                durationInFrames={Math.max(1, Math.round((durationMs / 1000) * 30))}
                fps={30}
                compositionWidth={aspectRatio === '9:16' ? 1080 : 1920}
                compositionHeight={aspectRatio === '9:16' ? 1920 : 1080}
                inputProps={{
                  audioUrl,
                  captions,
                  lyricStyleId: selectedStyleId,
                  scale,
                  backgroundClips,
                  cutMarkers: template.cutMarkers,
                  noCuts,
                  aspectRatio,
                  durationMs,
                }}
                style={{ width: '100%', height: '100%' }}
                loop
              />
            </div>
          </div>

          {/* Custom transport controls */}
          <div className="mx-auto flex w-full max-w-[900px] items-center gap-3 px-6 py-2">
            <button type="button" onClick={replay} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10" aria-label="Replay">
              <Repeat2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={togglePlay} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <span className="font-mono text-xs tabular-nums text-slate-400">
              {fmtTime(currentFrameMs)} / {fmtTime(durationMs)}
            </span>

            {/* Scrub bar with marker ticks */}
            <div className="relative flex-1 h-6 flex items-center">
              <div className="relative w-full h-2 rounded-full bg-white/10 overflow-hidden">
                {/* Segmented colored bar */}
                <div className="absolute inset-0">
                  {timelineSlots.map((slot, i) => {
                    const left = durationMs > 0 ? (slot.startMs / durationMs) * 100 : 0;
                    const width = durationMs > 0 ? ((slot.endMs - slot.startMs) / durationMs) * 100 : 0;
                    const colors = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-cyan-500', 'bg-pink-500', 'bg-yellow-500'];
                    const filled = slot.clipId !== null;
                    return (
                      <div
                        key={slot.slotIndex}
                        className={cn(
                          'absolute top-0 bottom-0',
                          filled ? colors[i % colors.length] : 'bg-white/5'
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    );
                  })}
                </div>
                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-10"
                  style={{ left: `${scrubPercent}%` }}
                />
              </div>

              {/* Cut marker ticks */}
              {cutMarkerPcts.map((pct, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full w-[2px] bg-rose-500"
                  style={{ left: `${pct}%` }}
                />
              ))}
            </div>
          </div>

          {/* Lag disclaimer */}
          <div className="mx-auto mb-2 flex w-full max-w-[900px] items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-300">
            <Info className="h-3.5 w-3.5" />
            The preview may lag during playback — don't worry, your export will be a perfectly smooth HD video!
          </div>

          {/* ── Timeline strip ── */}
          <div className="border-t border-cyan-400/10 bg-[#030507] px-6 py-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1.5">
              <span className="text-emerald-300">{filledSlotCount}/{totalSlots}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {timelineSlots.map((slot) => {
                const clip = slot.clipId ? assets.find((a) => a.id === slot.clipId) : null;
                const slotDurationSec = ((slot.endMs - slot.startMs) / 1000).toFixed(1);
                return (
                  <div
                    key={slot.slotIndex}
                    className={cn(
                      'group relative shrink-0 overflow-hidden rounded-lg border bg-[#0B0E13]',
                      clip ? 'w-24 h-24 border-cyan-400/20' : 'w-24 h-24 border-dashed border-white/10'
                    )}
                  >
                    {clip ? (
                      <>
                        {clip.posterUrl ? (
                          <img src={clip.posterUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <video src={clip.url} muted className="h-full w-full object-cover" />
                        )}
                        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-[10px] font-bold text-cyan-300">
                          {slot.slotIndex + 1}
                        </span>
                        <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 text-[9px] text-white">
                          {slotDurationSec}s
                        </span>
                        <button
                          type="button"
                          onClick={() => removeClipFromSlot(slot.slotIndex)}
                          className="absolute right-1 top-1 hidden rounded-full bg-black/70 p-1 text-white group-hover:block"
                          aria-label="Remove clip"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center">
                        <span className="text-[10px] font-bold text-slate-600">{slot.slotIndex + 1}</span>
                        <span className="text-[9px] text-slate-600">{slotDurationSec}s</span>
                        <span className="text-[8px] text-slate-700">Drop video here</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-[#080B10] p-6 shadow-[0_0_40px_rgba(34,211,238,0.16)]">
            <h2 className="text-lg font-black text-white">Confirm export</h2>
            <p className="mt-2 text-sm text-slate-400">
              This will spend {quantity} × {Math.ceil(durationMs / 1000)} = {creditCost} credits.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button>
              <button type="button" onClick={startExport} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-black">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label="Help"
        className="fixed bottom-8 right-8 inline-flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400 text-black shadow-[0_0_28px_rgba(34,211,238,0.45)]"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
    </div>
  );
};

function ControlLabel({ label }: { label: string }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>;
}

function SelectLike({
  value,
  onChange,
  options,
  labels = {},
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-cyan-400/25 bg-[#081019] py-2 pl-10 pr-3 text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

export default KanvasRemix;
