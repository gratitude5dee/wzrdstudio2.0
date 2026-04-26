import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Archive,
  CheckCircle2,
  Loader2,
  Music2,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { archiveTemplate, listTemplates } from '@/features/kanvas-lyrics/service';
import type { KanvasLyricTemplate, TemplateStatus } from '@/features/kanvas-lyrics/types';

type FilterKey = 'all' | 'drafts' | 'saved' | 'archived';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drafts', label: 'In progress' },
  { key: 'saved', label: 'Saved' },
  { key: 'archived', label: 'Archived' },
];

interface TemplatesLandingProps {
  onCreate: () => void;
  onOpen: (template: KanvasLyricTemplate) => void;
}

function statusTone(status: TemplateStatus) {
  switch (status) {
    case 'saved':
      return { label: 'SAVED', cls: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30' };
    case 'lyrics_ready':
    case 'markers_ready':
    case 'audio_ready':
      return { label: 'IN PROGRESS', cls: 'bg-[#f97316]/15 text-[#f97316] ring-[#f97316]/30' };
    case 'lyrics_processing':
      return { label: 'PROCESSING', cls: 'bg-[#fb923c]/15 text-[#fdba74] ring-[#fb923c]/30' };
    case 'failed':
      return { label: 'FAILED', cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' };
    case 'archived':
      return { label: 'ARCHIVED', cls: 'bg-white/5 text-zinc-400 ring-white/10' };
    case 'draft':
    default:
      return { label: 'DRAFT', cls: 'bg-white/5 text-zinc-300 ring-white/10' };
  }
}

export function TemplatesLanding({ onCreate, onOpen }: TemplatesLandingProps) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<KanvasLyricTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [archivingId, setArchivingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTemplates({ limit: 100 })
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch((e) => {
        console.error('[lyrics] listTemplates failed', e);
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (filter === 'drafts' && !['draft', 'audio_ready', 'lyrics_ready', 'markers_ready', 'lyrics_processing', 'failed'].includes(t.status)) return false;
      if (filter === 'saved' && t.status !== 'saved') return false;
      if (filter === 'archived' && t.status !== 'archived') return false;
      if (filter === 'all' && t.status === 'archived') return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, filter, search]);

  async function handleArchive(t: KanvasLyricTemplate) {
    if (!confirm(`Archive "${t.title}"?`)) return;
    setArchivingId(t.id);
    try {
      const updated = await archiveTemplate(t.id);
      setTemplates((prev) => prev.map((p) => (p.id === t.id ? updated : p)));
      toast.success('Template archived');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to archive');
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 pb-24 pt-10">
      {/* Hero */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f97316]/20 bg-[#f97316]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#f97316]">
          <Sparkles className="h-3 w-3" /> Lyric Templates
        </span>
        <h1 className="mt-4 bg-gradient-to-r from-[#fdba74] via-white to-[#f97316] bg-clip-text text-5xl font-black tracking-[0.16em] text-transparent md:text-6xl">
          YOUR TEMPLATES
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-xs uppercase tracking-[0.32em] text-zinc-500">
          Reusable lyric video bases · Audio · Lyrics · Markers
        </p>
      </div>

      {/* CTA + filter row */}
      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <button
          type="button"
          onClick={onCreate}
          className="group relative overflow-hidden rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-[#f97316]/10 via-[#0A0A0A] to-[#0A0A0A] p-6 text-left transition-all hover:border-[#f97316]/60 hover:shadow-[0_0_32px_rgba(249,115,22,0.18)]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f97316]/15 ring-1 ring-[#f97316]/30">
              <Plus className="h-6 w-6 text-[#f97316]" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white">Create new template</h3>
              <p className="mt-1 text-xs text-zinc-400">
                Upload a song, trim a 15–30s clip, sync the lyrics, and place cut markers.
              </p>
            </div>
            <span className="hidden rounded-full bg-[#f97316] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-black shadow-[0_0_20px_rgba(249,115,22,0.45)] transition-transform group-hover:scale-105 md:inline-block">
              Start
            </span>
          </div>
        </button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates"
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-xs text-white placeholder:text-zinc-500 focus:border-[#f97316]/50 focus:outline-none sm:w-56"
            />
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-[#0F1116] p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors',
                  filter === f.key
                    ? 'bg-[#f97316]/15 text-[#f97316] shadow-[inset_0_0_10px_rgba(249,115,22,0.18)]'
                    : 'text-zinc-500 hover:text-zinc-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <section className="mt-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onOpen={() => onOpen(t)}
                onArchive={() => handleArchive(t)}
                archiving={archivingId === t.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="mt-16 rounded-2xl border border-white/5 bg-[#0B0D13] p-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          How it works
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { n: 1, title: 'Upload audio', body: 'Drop a 15–30 second clip from your song.' },
            { n: 2, title: 'Sync lyrics', body: 'AI transcribes and aligns words to the beat.' },
            { n: 3, title: 'Place markers', body: 'Tap M to mark cut points across the clip.' },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]/15 text-[10px] font-bold text-[#f97316]">
                  {s.n}
                </span>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white">
                  {s.title}
                </h3>
              </div>
              <p className="mt-2 text-xs text-zinc-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

// --- subcomponents ----------------------------------------------------------

function TemplateCard({
  template,
  onOpen,
  onArchive,
  archiving,
}: {
  template: KanvasLyricTemplate;
  onOpen: () => void;
  onArchive: () => void;
  archiving: boolean;
}) {
  const tone = statusTone(template.status);
  const updated = (() => {
    const d = new Date(template.updatedAt);
    return isNaN(d.getTime()) ? '—' : formatDistanceToNow(d, { addSuffix: true });
  })();
  const wordCount = template.lyricBlocks.reduce((s, b) => s + b.words.length, 0);
  const peaks = template.waveformPeaks.length ? template.waveformPeaks : Array.from({ length: 56 }, (_, i) => Math.abs(Math.sin(i * 0.4)) * 0.7 + 0.2);

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#0F1116] transition-all hover:border-[#f97316]/30 hover:shadow-[0_0_24px_rgba(249,115,22,0.12)]',
        archiving && 'opacity-50'
      )}
    >
      {/* Mini waveform thumb */}
      <button
        type="button"
        onClick={onOpen}
        className="relative flex h-24 w-full items-center gap-[2px] overflow-hidden bg-gradient-to-br from-[#f97316]/10 via-black to-black px-3"
      >
        {peaks.slice(0, 80).map((p, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-[#f97316]/70"
            style={{ height: `${Math.max(0.15, Math.min(1, p)) * 70}%` }}
          />
        ))}
        <div className="absolute right-3 top-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ring-1',
              tone.cls
            )}
          >
            {tone.label}
          </span>
        </div>
        {template.status === 'saved' && (
          <CheckCircle2 className="absolute bottom-2 right-3 h-4 w-4 text-emerald-400" />
        )}
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="truncate text-sm font-bold text-white">{template.title}</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">Updated {updated}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-white/10">
            {Math.round(template.selectionDurationMs / 1000)}s
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-white/10">
            {wordCount} words
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-white/10">
            {template.cutMarkers.length} cuts
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 rounded-full bg-[#f97316] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-black shadow-[0_0_18px_rgba(249,115,22,0.35)] transition-transform hover:scale-[1.02]"
          >
            {template.status === 'saved' ? 'Open' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={onArchive}
            disabled={archiving || template.status === 'archived'}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title="Archive"
          >
            {archiving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#0B0D13] py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f97316]/10 ring-1 ring-[#f97316]/20">
        <Music2 className="h-7 w-7 text-[#f97316]" />
      </div>
      <h3 className="mt-4 text-base font-bold text-white">No templates yet</h3>
      <p className="mt-1 max-w-xs text-xs text-zinc-500">
        Create your first reusable lyric template — once saved, it can be powered by Remix, Scenes, or Performance.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 rounded-full bg-[#f97316] px-5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-black shadow-[0_0_22px_rgba(249,115,22,0.4)] hover:brightness-110"
      >
        Create template
      </button>
    </div>
  );
}
