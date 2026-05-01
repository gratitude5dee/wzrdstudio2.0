import { useCallback, useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Clapperboard,
  Download,
  Film,
  Filter,
  Grid2X2,
  HelpCircle,
  Import,
  Info,
  Loader2,
  Music2,
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
import type { AspectRatio, FootageAsset, FootageCategory } from '@/features/remix/types';
import type { LyricStyle, LyricStyleId } from '@/lib/lyric-styles';
import { LYRIC_STYLES } from '@/lib/lyric-styles';
import {
  estimateRequiredClipSlots,
  lyricBlocksToCaptions,
  quoteRemixCredits,
  seededShuffle,
} from '@/lib/remix-utils';
import { LyricRemixComposition } from '@/components/remix/LyricRemixComposition';

type RatioFilter = 'all' | AspectRatio;
type SortKey = 'newest' | 'oldest' | 'shortest' | 'longest';

const DEFAULT_SCALE = 0.65;

const KanvasRemix = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId?: string }>();
  const [templates, setTemplates] = useState<KanvasLyricTemplate[]>([]);
  const [template, setTemplate] = useState<KanvasLyricTemplate | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [categories, setCategories] = useState<FootageCategory[]>([]);
  const [assets, setAssets] = useState<FootageAsset[]>([]);
  const [selectedClips, setSelectedClips] = useState<FootageAsset[]>([]);
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
    return () => {
      cancelled = true;
    };
  }, [navigate, templateId]);

  useEffect(() => {
    let cancelled = false;
    if (!template) {
      setAudioUrl(null);
      return;
    }
    resolveTemplateAudioUrl(template.sourceAudioAssetId).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [template]);

  useEffect(() => {
    let cancelled = false;
    listFootageAssets({ categoryId, ratio: clipRatio, filter: tagFilter, sort }).then((rows) => {
      if (!cancelled) setAssets(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [categoryId, clipRatio, tagFilter, sort]);

  const captions = useMemo(() => (template ? lyricBlocksToCaptions(template.lyricBlocks) : []), [template]);
  const durationMs = template?.selectionDurationMs ?? 15000;
  const requiredSlots = useMemo(
    () => estimateRequiredClipSlots(durationMs, selectedClips.length ? selectedClips : assets),
    [assets, durationMs, selectedClips]
  );
  const creditCost = quoteRemixCredits(durationMs, quantity);
  const selectedStyle = styles.find((style) => style.id === selectedStyleId) ?? LYRIC_STYLES[0];
  const rootCategory = categories.find((category) => category.id === 'bay-area');
  const activeCategory = categories.find((category) => category.id === categoryId);

  const addClip = (clip: FootageAsset) => {
    setSelectedClips((prev) => [...prev, clip]);
  };

  const shuffleClips = useCallback(() => {
    setSelectedClips((prev) => {
      const base = prev.length > 0 ? prev : assets;
      return seededShuffle(base, Date.now()).slice(0, Math.max(requiredSlots, 1));
    });
    setShuffleEach(quantity > 1);
  }, [assets, quantity, requiredSlots]);

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
        clipIds: selectedClips.map((clip) => clip.id),
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

  return (
    <div className="min-h-screen overflow-hidden bg-black text-white">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[590px_1fr]">
        <aside className="border-r border-cyan-400/10 bg-[#030507] px-10 py-7">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-4xl font-black tracking-tight text-transparent">
                Remix
              </h1>
              <HelpCircle className="h-4 w-4 text-slate-500" />
            </div>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
              Build beat-synced videos from your clip library. Pick a template, shuffle your clips, and export.
            </p>
          </div>

          <section className="mt-7">
            <div className="flex items-center justify-between border-b border-cyan-400/10 pb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-200">
                <Film className="h-4 w-4 text-cyan-300" />
                Clip Library
                <span className="text-slate-500">{assets.length}</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-cyan-300">
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

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-500">
                <button type="button" onClick={() => setCategoryId(null)} className="hover:text-cyan-200">
                  All Categories
                </button>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => setCategoryId(rootCategory?.id ?? null)}
                  className="truncate hover:text-cyan-200"
                >
                  {rootCategory?.name ?? 'Bay Area'}
                </button>
                <span>/</span>
                <span className="font-bold text-slate-200">{activeCategory?.name ?? 'All'}</span>
              </div>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="rounded-lg border border-white/10 bg-[#0B0E13] px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="shortest">Shortest</option>
                <option value="longest">Longest</option>
              </select>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => addClip(asset)}
                  className="group min-w-0 text-left"
                >
                  <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-cyan-400/10 bg-[#0D1117]">
                    {asset.posterUrl ? (
                      <img src={asset.posterUrl} alt="" className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    ) : (
                      <video src={asset.url} muted className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    )}
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {(asset.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-400 group-hover:text-white">{asset.title}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-cyan-400/10 pt-4">
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
              <div className="mt-3 space-y-4">
                <ControlLabel label="Template" />
                <select
                  value={template.id}
                  onChange={(event) => navigate(`/kanvas/remix/${event.target.value}`)}
                  className="w-full rounded-lg border border-cyan-400/40 bg-[#081019] px-3 py-2 text-sm text-white outline-none"
                >
                  {templates.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title} - {Math.round(row.selectionDurationMs / 1000)}s
                      {row.cutMarkers.length === 0 ? ' - No cuts' : ''}
                    </option>
                  ))}
                </select>

                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <X className="h-3 w-3" />
                    No cuts
                  </span>
                  <Switch checked={noCuts} onCheckedChange={setNoCuts} />
                </div>

                <ControlLabel label="Lyric Style" />
                <div className="grid grid-cols-8 gap-2">
                  {styles.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyleId(style.id as LyricStyleId)}
                      className={cn(
                        'flex h-12 flex-col items-center justify-center rounded-lg border bg-black text-[9px] transition-colors',
                        selectedStyleId === style.id
                          ? 'border-cyan-300 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.25)]'
                          : 'border-white/10 text-slate-500 hover:border-cyan-400/40'
                      )}
                    >
                      <span className="text-[13px] font-black" style={{ color: style.accentFill ?? style.fill }}>
                        {style.id === 'none' ? '-' : 'THE'}
                      </span>
                      <span>{style.name}</span>
                    </button>
                  ))}
                </div>

                <ControlLabel label={`Scale: ${scale.toFixed(2)}x`} />
                <Slider min={0.4} max={1.4} step={0.05} value={[scale]} onValueChange={(v) => setScale(v[0] ?? DEFAULT_SCALE)} />

                <ControlLabel label="Clip Ratio" />
                <SelectLike value={clipRatio} onChange={(value) => setClipRatio(value as RatioFilter)} options={['all', '9:16', '1:1', '16:9']} labels={{ all: 'All Ratios' }} icon={<Grid2X2 className="h-4 w-4" />} />

                <ControlLabel label="Filter" />
                <SelectLike value={tagFilter} onChange={setTagFilter} options={['all', '8mm', 'Modern', 'Aerial', 'Abstract', 'Nature']} labels={{ all: 'All' }} icon={<Filter className="h-4 w-4" />} />

                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300"
                      style={{ width: `${Math.min(100, (selectedClips.length / Math.max(1, requiredSlots)) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-emerald-300">
                    {selectedClips.length}/{requiredSlots} <Check className="inline h-3 w-3" />
                  </p>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={shuffleClips}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-400/15"
                  >
                    <Shuffle className="h-4 w-4" />
                    {quantity > 1 ? 'Shuffle each' : 'Shuffle'}
                  </button>
                  <div className="flex items-center rounded-lg border border-white/10 bg-[#0B0E13]">
                    <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-slate-300">
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                    <button type="button" onClick={() => setQuantity((q) => Math.min(10, q + 1))} className="px-3 py-2 text-slate-300">
                      +
                    </button>
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
                  <span className="rounded-full bg-black/20 px-2 py-0.5">{creditCost}</span>
                </button>
              </div>
            )}
          </section>
        </aside>

        <main className="relative flex min-h-screen flex-col bg-black px-6 py-2 lg:px-8">
          <div className="absolute right-8 top-2 z-10 inline-flex overflow-hidden rounded-lg border border-white/10 bg-[#0B0E13] text-xs font-bold">
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

          <div className="flex flex-1 items-center justify-center pt-8">
            <div className={cn('relative overflow-hidden rounded-xl border border-white/10 bg-[#050505]', aspectRatio === '9:16' ? 'h-[620px] w-[349px]' : 'h-[430px] w-[764px]')}>
              <Player
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
                  backgroundClips: selectedClips.length ? selectedClips : assets.slice(0, requiredSlots),
                  cutMarkers: template.cutMarkers,
                  noCuts,
                  aspectRatio,
                  durationMs,
                }}
                style={{ width: '100%', height: '100%' }}
                controls
                loop
                clickToPlay
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-black/40 p-4 backdrop-blur">
                  <Play className="h-7 w-7 fill-white text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mb-3 flex w-full max-w-[1220px] items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-300">
            <Info className="h-4 w-4" />
            The preview may lag during playback - your export will be a smooth HD video.
          </div>

          <div className="h-32 border-t border-cyan-400/10 pt-2">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {(selectedClips.length ? selectedClips : assets.slice(0, 1)).map((clip, index) => (
                <div key={`${clip.id}-${index}`} className="group relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-cyan-400/20 bg-[#0B0E13]">
                  {clip.posterUrl ? <img src={clip.posterUrl} alt="" className="h-full w-full object-cover" /> : <video src={clip.url} muted className="h-full w-full object-cover" />}
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">{index + 1}</span>
                  <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 text-[10px]">{(clip.durationMs / 1000).toFixed(1)}s</span>
                  <button
                    type="button"
                    onClick={() => setSelectedClips((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute right-1 top-1 hidden rounded-full bg-black/70 p-1 text-white group-hover:block"
                    aria-label="Remove clip"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-[#080B10] p-6 shadow-[0_0_40px_rgba(34,211,238,0.16)]">
            <h2 className="text-lg font-black text-white">Confirm export</h2>
            <p className="mt-2 text-sm text-slate-400">
              This will spend {quantity} x {Math.ceil(durationMs / 1000)} = {creditCost} credits.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300">
                Cancel
              </button>
              <button type="button" onClick={startExport} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-black">
                Confirm
              </button>
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
        onChange={(event) => onChange(event.target.value)}
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
