import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AtSign,
  Boxes,
  Check,
  Copy,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Pin,
  Search,
  ShieldCheck,
  Sparkles,
  User2,
  Video,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { MentionDropdown } from '@/components/character-creation/MentionDropdown';
import { FinalizeAssetDialog } from '@/components/ip-vault/FinalizeAssetDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCharacterMention } from '@/hooks/useCharacterMention';
import { sortBlueprintsForReference } from '@/lib/characterBlueprintReference';
import { musicPolishAssets } from '@/lib/musicPolishAssets';
import { normalizeReferenceTags } from '@/lib/referenceRegistry';
import { appRoutes } from '@/lib/routes';
import { toSlug, useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { cn } from '@/lib/utils';
import { assetService } from '@/services/assetService';
import { createBlueprint, listBlueprints, toggleBlueprintPinned } from '@/services/characterBlueprintService';
import type { Project } from '@/components/home/ProjectCard';
import type { AssetCategory, AssetType, ProjectAsset } from '@/types/assets';
import type { CharacterBlueprint, CharacterKind, CharacterMention } from '@/types/character-creation';

type StoreKind = Extract<CharacterKind, 'character' | 'location' | 'object'>;
type TypeFilter = 'all' | Extract<AssetType, 'image' | 'video'>;
type CategoryFilter = 'all' | AssetCategory;

interface AuraAssetStoreProps {
  projects?: Project[];
}

const KIND_META: Record<StoreKind, { label: string; icon: LucideIcon; seed: string; accent: string }> = {
  character: {
    label: 'Character',
    icon: User2,
    seed: 'CHARACTER ANCHOR: name, age range, face shape, eyes, hair, body build, signature clothing, style target.',
    accent: 'text-orange-300 border-orange-400/35 bg-orange-400/10',
  },
  location: {
    label: 'Location',
    icon: MapPin,
    seed: 'LOCATION ANCHOR: place type, geography, architecture, era, lighting, palette, mood, signature landmarks.',
    accent: 'text-lime-300 border-lime-300/30 bg-lime-300/10',
  },
  object: {
    label: 'Object',
    icon: Boxes,
    seed: 'OBJECT ANCHOR: object type, silhouette, material, color, markings, wear, scale, style target.',
    accent: 'text-amber-300 border-amber-300/30 bg-amber-300/10',
  },
};

const BLUEPRINT_PRESETS = [
  { kind: 'character', asset: musicPolishAssets.blueprints.vocalist },
  { kind: 'location', asset: musicPolishAssets.blueprints.soundstage },
  { kind: 'object', asset: musicPolishAssets.blueprints.microphone },
] as const;

function getAssetPreviewUrl(asset: ProjectAsset): string | null {
  if (asset.asset_type === 'image') {
    return asset.thumbnail_url ?? asset.preview_url ?? asset.cdn_url;
  }
  if (asset.asset_type === 'video') {
    return asset.thumbnail_url ?? asset.preview_url ?? asset.cdn_url;
  }
  return null;
}

function getReferenceImageUrl(asset: ProjectAsset): string | null {
  if (asset.asset_type === 'image') {
    return asset.thumbnail_url ?? asset.preview_url ?? asset.cdn_url;
  }
  if (asset.asset_type === 'video') {
    return asset.thumbnail_url ?? asset.preview_url;
  }
  return null;
}

function isUsableReference(asset: ProjectAsset): boolean {
  return asset.asset_type === 'image'
    ? Boolean(getAssetPreviewUrl(asset))
    : asset.asset_type === 'video' && Boolean(getReferenceImageUrl(asset));
}

function getCommonProjectId(assets: ProjectAsset[]): string | null {
  if (assets.length === 0) return null;
  const first = assets[0]?.project_id ?? null;
  return assets.every((asset) => (asset.project_id ?? null) === first) ? first : null;
}

function buildKanvasHref(studio: 'image' | 'video' | 'cinema' | 'character-creation' | 'worldview', slug?: string, suffix = '') {
  const params = new URLSearchParams({ studio });
  if (slug) params.set('prompt', `@${slug} ${suffix}`.trimEnd());
  return `${appRoutes.kanvas}?${params.toString()}`;
}

function getAssetProjectLabel(asset: ProjectAsset, projects: Project[]): string {
  return projects.find((project) => project.id === asset.project_id)?.title ?? 'Workspace';
}

function getLoadDiagnostic(error: string | null) {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (lower.includes('auth') || lower.includes('session') || lower.includes('jwt')) {
    return {
      title: 'Sign in required',
      body: 'Your session is not available, so workspace assets cannot be loaded yet.',
    };
  }
  if (lower.includes('column') || lower.includes('schema') || lower.includes('does not exist')) {
    return {
      title: 'Asset library schema mismatch',
      body: 'The app could not read the deployed asset table shape. The safe loader will use normalized asset rows after the schema is updated.',
    };
  }
  return {
    title: 'Asset library unavailable',
    body: error,
  };
}

function BlueprintThumb({ blueprint }: { blueprint: CharacterBlueprint }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-zinc-950">
      {blueprint.imageUrl ? (
        <img src={blueprint.imageUrl} alt={blueprint.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <AtSign className="h-5 w-5 text-zinc-600" />
        </div>
      )}
    </div>
  );
}

export function AuraAssetStore({ projects = [] }: AuraAssetStoreProps) {
  const navigate = useNavigate();
  const anchorRef = useRef<HTMLTextAreaElement | null>(null);
  const addBlueprint = useCharacterCreationStore((state) => state.addBlueprint);
  const updateBlueprint = useCharacterCreationStore((state) => state.updateBlueprint);
  const blueprints = useCharacterCreationStore((state) => state.blueprints);
  const setBlueprints = useCharacterCreationStore((state) => state.setBlueprints);
  const {
    suggestions,
    showSuggestions,
    onPromptChange,
    onSelectSuggestion,
    closeSuggestions,
    toggleMentionPinned,
  } = useCharacterMention();

  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingBlueprints, setLoadingBlueprints] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [kind, setKind] = useState<StoreKind>('character');
  const [name, setName] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [promptAnchor, setPromptAnchor] = useState(KIND_META.character.seed);
  const [referenceLabels, setReferenceLabels] = useState<Record<string, string>>({});
  const [finalizeSource, setFinalizeSource] = useState<{
    sourceType: 'project_asset';
    sourceId: string;
    title: string;
    description: string | null;
    assetKind: string;
    previewUrl: string | null;
  } | null>(null);

  const selectedAssets = useMemo(
    () => selectedIds.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is ProjectAsset => Boolean(asset)),
    [assets, selectedIds],
  );

  const usableAssets = useMemo(() => assets.filter(isUsableReference), [assets]);

  const filteredAssets = useMemo(() => {
    return usableAssets.filter((asset) => {
      if (typeFilter !== 'all' && asset.asset_type !== typeFilter) return false;
      if (categoryFilter !== 'all' && asset.asset_category !== categoryFilter) return false;
      if (projectFilter !== 'all' && asset.project_id !== projectFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const normalizedTagQuery = query.startsWith('@') ? query.slice(1) : query;
        const haystack = [
          asset.original_file_name,
          asset.file_name,
          asset.asset_category,
          ...(asset.tags ?? []),
          asset.media_metadata.prompt_fragment,
          asset.media_metadata.slug,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query) && !asset.tags?.some((tag) => tag.includes(normalizedTagQuery))) return false;
      }
      return true;
    });
  }, [categoryFilter, projectFilter, searchQuery, typeFilter, usableAssets]);

  const sortedBlueprints = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const normalizedTagQuery = query.startsWith('@') ? query.slice(1) : query;
    const filteredBlueprints = query
      ? blueprints.filter((blueprint) => {
          const haystack = [
            blueprint.name,
            blueprint.slug,
            blueprint.kind,
            blueprint.promptFragment,
            getAssetProjectLabel({ project_id: blueprint.projectId } as ProjectAsset, projects),
            ...(blueprint.tags ?? []),
            ...(blueprint.referenceAssets?.map((asset) => asset.role) ?? []),
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(query) || blueprint.tags?.some((tag) => tag.includes(normalizedTagQuery));
        })
      : blueprints;

    return sortBlueprintsForReference(filteredBlueprints);
  }, [blueprints, projects, searchQuery]);
  const pinnedCount = useMemo(() => blueprints.filter((blueprint) => blueprint.isFavorite).length, [blueprints]);
  const slugPreview = toSlug(name);
  const diagnostic = getLoadDiagnostic(error);

  useEffect(() => {
    let cancelled = false;
    setLoadingAssets(true);
    setError(null);

    assetService
      .list({
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: 300,
      })
      .then((rows) => {
        if (!cancelled) setAssets(rows.filter((asset) => asset.asset_type === 'image' || asset.asset_type === 'video'));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load assets.');
      })
      .finally(() => {
        if (!cancelled) setLoadingAssets(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingBlueprints(true);
    listBlueprints()
      .then((rows) => {
        if (!cancelled) setBlueprints(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load saved blueprints.');
      })
      .finally(() => {
        if (!cancelled) setLoadingBlueprints(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setBlueprints]);

  const toggleAsset = (asset: ProjectAsset) => {
    setSelectedIds((current) =>
      current.includes(asset.id)
        ? current.filter((id) => id !== asset.id)
        : [...current, asset.id],
    );
    setReferenceLabels((current) => ({
      ...current,
      [asset.id]: current[asset.id] ?? asset.original_file_name,
    }));
  };

  const handleKindChange = (nextKind: StoreKind) => {
    setKind(nextKind);
    if (!promptAnchor.trim() || Object.values(KIND_META).some((meta) => meta.seed === promptAnchor)) {
      setPromptAnchor(KIND_META[nextKind].seed);
    }
  };

  const handleAnchorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value;
    setPromptAnchor(value);
    onPromptChange(value, event.currentTarget.selectionStart);
  };

  const handleMentionSelect = (mention: CharacterMention) => {
    const replaced = onSelectSuggestion(mention, promptAnchor);
    setPromptAnchor(replaced);
    window.requestAnimationFrame(() => anchorRef.current?.focus());
  };

  const handleMentionTogglePin = (mention: CharacterMention) => {
    void toggleMentionPinned(mention).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update pin.');
    });
  };

  const handleToggleBlueprintPin = async (blueprint: CharacterBlueprint) => {
    const nextPinned = !blueprint.isFavorite;
    updateBlueprint(blueprint.id, { isFavorite: nextPinned });
    try {
      const updated = await toggleBlueprintPinned(blueprint.id, nextPinned);
      updateBlueprint(updated.id, updated);
      toast.success(nextPinned ? `Pinned @${blueprint.slug}` : `Unpinned @${blueprint.slug}`);
    } catch (err) {
      updateBlueprint(blueprint.id, { isFavorite: blueprint.isFavorite });
      toast.error(err instanceof Error ? err.message : 'Failed to update pin.');
    }
  };

  const handleSaveBlueprint = async () => {
    if (!name.trim()) {
      toast.error('Name the blueprint before saving.');
      return;
    }
    if (!promptAnchor.trim()) {
      toast.error('Add a reusable prompt anchor.');
      return;
    }
    if (selectedAssets.length === 0) {
      toast.error('Select at least one usable image or video reference.');
      return;
    }

    const referenceImages = selectedAssets
      .map((asset, index) => {
        const imageUrl = getReferenceImageUrl(asset);
        if (!imageUrl) return null;
        return {
          assetId: asset.id,
          imageUrl,
          label: referenceLabels[asset.id] ?? asset.original_file_name,
          generationRole: index === 0 ? 'primary' : 'reference',
          generationMetadata: {
            source: 'aura_asset_store',
            assetType: asset.asset_type,
            assetCategory: asset.asset_category,
          },
          isPrimary: index === 0,
        };
      })
      .filter((reference): reference is NonNullable<typeof reference> => reference !== null);

    if (referenceImages.length === 0) {
      toast.error('Selected assets need image thumbnails or previews before they can become references.');
      return;
    }

    setSaving(true);
    try {
      const blueprint = await createBlueprint({
        name: name.trim(),
        kind,
        traits: {},
        faceDetails: {},
        bodyDetails: {},
        styleDetails: { customPrompt: promptAnchor.trim() },
        promptFragment: promptAnchor.trim(),
        tags: normalizeReferenceTags(tagInput.split(/[,\s]+/)),
        projectId: getCommonProjectId(selectedAssets),
        referenceImages,
      });

      addBlueprint(blueprint);
      setSelectedIds([]);
      setTagInput('');
      setReferenceLabels({});
      setName('');
      setPromptAnchor(KIND_META[kind].seed);
      closeSuggestions();
      toast.success(`Saved ${KIND_META[kind].label.toLowerCase()} @${blueprint.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save blueprint.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 text-white" data-testid="aura-asset-store">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300">
            <Sparkles className="h-3.5 w-3.5" />
            Asset Store
          </div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Blueprint Reference Library</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Curate artist, set, and prop anchors for music-video prompts without starting a generation job.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(buildKanvasHref('character-creation'))}
          className="gap-2 border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
        >
          <AtSign className="h-4 w-4 text-orange-300" />
          Character Creation
        </Button>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_440px]">
        <section className="overflow-hidden rounded-lg border border-white/10 bg-[#0c0c0f]/90 shadow-[0_22px_80px_rgba(0,0,0,0.28)]">
          <div className="border-b border-white/[0.06] p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_130px_150px_170px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search uploaded references..."
                  className="h-10 rounded-2xl border-white/10 bg-black/40 pl-9 text-sm text-white placeholder:text-zinc-600 focus-visible:ring-orange-400/25"
                />
              </div>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
                <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/40 text-white">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All media</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}>
                <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/40 text-white">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="upload">Uploaded</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                  <SelectItem value="template">Templates</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-10 rounded-2xl border-white/10 bg-black/40 text-white">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-400">
                {usableAssets.length} usable refs
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-400">
                {selectedAssets.length} selected
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-400">
                {pinnedCount} pinned
              </Badge>
            </div>
          </div>

          {selectedAssets.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-white/[0.06] bg-white/[0.02] p-3">
              {selectedAssets.map((asset, index) => {
                const previewUrl = getAssetPreviewUrl(asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleAsset(asset)}
                    className="group flex min-w-[180px] items-center gap-2 rounded-2xl border border-orange-300/20 bg-orange-300/10 p-2 text-left"
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-xl bg-black/40">
                      {previewUrl ? (
                        <img src={previewUrl} alt={asset.original_file_name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <ImageIcon className="m-3 h-4 w-4 text-zinc-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{referenceLabels[asset.id] ?? asset.original_file_name}</p>
                      <p className="text-[10px] text-orange-200/70">{index === 0 ? 'Primary reference' : `Reference ${index + 1}`}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="p-4">
            {loadingAssets ? (
              <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-white/[0.06] bg-black/20">
                <Loader2 className="h-6 w-6 animate-spin text-orange-300" />
              </div>
            ) : diagnostic ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-white/[0.08] bg-black/20 p-6 text-center">
                <AlertCircle className="mb-3 h-9 w-9 text-orange-300" />
                <p className="text-sm font-semibold text-white">{diagnostic.title}</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500">{diagnostic.body}</p>
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.09] bg-black/20 p-6 text-center">
                <div className="mb-5 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                  {BLUEPRINT_PRESETS.map(({ kind: presetKind, asset }) => (
                    <div key={asset.title} className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#111114] text-left">
                      <div className="aspect-[4/3] bg-black">
                        <img
                          src={asset.src}
                          alt={asset.alt}
                          className="h-full w-full object-cover opacity-85"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-semibold text-white">{asset.title}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-orange-200/70">{presetKind}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <ImageIcon className="mb-3 h-10 w-10 text-zinc-600" />
                <p className="text-sm font-semibold text-white">
                  {usableAssets.length === 0 ? 'No usable references yet.' : 'No matching references.'}
                </p>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                  {usableAssets.length === 0
                    ? 'Upload or generate artist, location, and object references to turn them into reusable music-video anchors.'
                    : 'Adjust filters or search to broaden the reference set.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredAssets.map((asset) => {
                  const previewUrl = getAssetPreviewUrl(asset);
                  const selected = selectedIds.includes(asset.id);
                  const canReference = Boolean(getReferenceImageUrl(asset));
                  return (
                    <div
                      key={asset.id}
                      onClick={() => toggleAsset(asset)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleAsset(asset);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'group overflow-hidden rounded-2xl border bg-[#111114] text-left transition-all cursor-pointer',
                        'hover:border-orange-300/40 hover:bg-[#161619]',
                        selected ? 'border-orange-300 ring-2 ring-orange-300/20' : 'border-white/[0.06]',
                      )}
                      data-testid="aura-asset-card"
                    >
                      <div className="relative aspect-square bg-black/50">
                        {previewUrl ? (
                          asset.asset_type === 'video' && !asset.thumbnail_url && !asset.preview_url ? (
                            <video src={previewUrl} className="h-full w-full object-cover opacity-90" muted playsInline preload="metadata" />
                          ) : (
                            <img src={previewUrl} alt={asset.original_file_name} className="h-full w-full object-cover" loading="lazy" />
                          )
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            {asset.asset_type === 'video' ? <Video className="h-8 w-8 text-zinc-600" /> : <ImageIcon className="h-8 w-8 text-zinc-600" />}
                          </div>
                        )}
                        <div className="absolute left-2 top-2 flex gap-1">
                          <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold capitalize text-zinc-300 backdrop-blur">
                            {asset.asset_type}
                          </span>
                          {!canReference && (
                            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur">
                              preview only
                            </span>
                          )}
                        </div>
                        {selected && (
                          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-orange-400 text-black shadow-lg">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setFinalizeSource({
                              sourceType: 'project_asset',
                              sourceId: asset.id,
                              title: asset.original_file_name || asset.file_name || 'Untitled asset',
                              description: null,
                              assetKind: asset.asset_category || asset.asset_type,
                              previewUrl,
                            });
                          }}
                          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-orange-300/25 bg-black/70 px-2 py-1 text-[10px] font-semibold text-orange-100 opacity-0 backdrop-blur transition-opacity hover:bg-orange-300/15 group-hover:opacity-100 focus:opacity-100"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Finalize
                        </button>
                      </div>
                      <div className="space-y-1.5 p-3">
                        <p className="truncate text-xs font-semibold text-white">{asset.original_file_name}</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] text-zinc-500">{getAssetProjectLabel(asset, projects)}</span>
                          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] capitalize text-zinc-500">
                            {asset.asset_category}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-white/10 bg-[#0c0c0f]/90 p-4 shadow-[0_22px_80px_rgba(0,0,0,0.25)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Create Blueprint</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Anchor + references</h3>
              </div>
              <Wand2 className="h-5 w-5 text-orange-300" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(KIND_META) as StoreKind[]).map((value) => {
                const meta = KIND_META[value];
                const Icon = meta.icon;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleKindChange(value)}
                    className={cn(
                      'rounded-2xl border px-3 py-3 text-xs font-semibold transition-colors',
                      kind === value ? meta.accent : 'border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]',
                    )}
                  >
                    <Icon className="mx-auto mb-1 h-4 w-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name, e.g. Nova Pilot"
                className="h-10 rounded-2xl border-white/10 bg-black/40 text-white placeholder:text-zinc-600 focus-visible:ring-orange-400/25"
              />
              <p className="text-xs text-zinc-500">
                Mention slug: <span className="font-mono text-orange-300">@{slugPreview || 'name'}</span>
              </p>
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="Tags, e.g. hero, pilot, close-up"
                className="h-10 rounded-2xl border-white/10 bg-black/40 text-white placeholder:text-zinc-600 focus-visible:ring-orange-400/25"
              />
            </div>

            <div className="relative mt-4">
              <MentionDropdown
                suggestions={suggestions}
                onSelect={handleMentionSelect}
                onTogglePin={handleMentionTogglePin}
                visible={showSuggestions}
              />
              <Textarea
                ref={anchorRef}
                value={promptAnchor}
                onChange={handleAnchorChange}
                onBlur={() => window.setTimeout(closeSuggestions, 150)}
                rows={6}
                placeholder="Write the reusable identity anchor..."
                className="resize-none rounded-2xl border-white/10 bg-black/40 text-sm leading-relaxed text-white placeholder:text-zinc-600 focus-visible:ring-orange-400/25"
              />
            </div>

            {selectedAssets.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Reference labels</p>
                {selectedAssets.map((asset, index) => (
                  <div key={asset.id} className="flex items-center gap-2">
                    <Badge variant={index === 0 ? 'default' : 'outline'} className="w-16 justify-center text-[10px]">
                      {index === 0 ? 'Primary' : `Ref ${index + 1}`}
                    </Badge>
                    <Input
                      value={referenceLabels[asset.id] ?? asset.original_file_name}
                      onChange={(event) =>
                        setReferenceLabels((current) => ({ ...current, [asset.id]: event.target.value }))
                      }
                      className="h-8 rounded-xl border-white/10 bg-black/30 text-xs text-white"
                    />
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              onClick={handleSaveBlueprint}
              disabled={saving}
              className="mt-4 w-full gap-2 rounded-2xl bg-orange-400 text-black hover:bg-orange-300"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Save Blueprint
            </Button>
          </section>

          <section className="rounded-lg border border-white/10 bg-[#0c0c0f]/90 p-4 shadow-[0_22px_80px_rgba(0,0,0,0.25)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Saved Blueprints</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{blueprints.length} anchors</h3>
              </div>
              {loadingBlueprints && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
            </div>
            <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
              {sortedBlueprints.length === 0 && !loadingBlueprints ? (
                <p className="rounded-2xl border border-dashed border-white/[0.08] p-4 text-center text-sm text-zinc-500">
                  No reusable blueprints yet.
                </p>
              ) : (
                sortedBlueprints.slice(0, 18).map((blueprint) => (
                  <div key={blueprint.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                    <div className="flex items-start gap-3">
                      <BlueprintThumb blueprint={blueprint} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{blueprint.name}</p>
                          <Badge variant="outline" className="border-white/10 text-[10px] capitalize text-zinc-400">
                            {blueprint.kind === 'environment' ? 'location' : blueprint.kind}
                          </Badge>
                        </div>
                        <p className="truncate font-mono text-xs text-orange-300">@{blueprint.slug}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{blueprint.promptFragment}</p>
                        {(blueprint.tags?.length || blueprint.referenceAssets?.length) ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(blueprint.tags ?? []).slice(0, 4).map((tag) => (
                              <span key={tag} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">
                                @{tag}
                              </span>
                            ))}
                            {Array.from(new Set((blueprint.referenceAssets ?? []).map((asset) => asset.role))).slice(0, 3).map((role) => (
                              <span key={role} className="rounded-full bg-orange-300/10 px-2 py-0.5 text-[10px] text-orange-200">
                                {role}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleBlueprintPin(blueprint)}
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors',
                          blueprint.isFavorite
                            ? 'border-orange-300/30 bg-orange-300/10 text-orange-300'
                            : 'border-white/[0.06] text-zinc-600 hover:text-zinc-300',
                        )}
                        aria-label={blueprint.isFavorite ? `Unpin ${blueprint.name}` : `Pin ${blueprint.name}`}
                      >
                        <Pin className={cn('h-3.5 w-3.5', blueprint.isFavorite && 'fill-current')} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]"
                        onClick={() => {
                          void navigator.clipboard.writeText(`@${blueprint.slug}`);
                          toast.success(`Copied @${blueprint.slug}`);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('image', blueprint.slug))}>
                        Image
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('video', blueprint.slug))}>
                        Video
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('cinema', blueprint.slug))}>
                        Cinema
                      </Button>
                      {blueprint.kind === 'character' && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('image', blueprint.slug, 'character sheet'))}>
                            Sheet
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('image', blueprint.slug, 'T-pose reference'))}>
                            T-pose
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('image', blueprint.slug, 'five angle character turnaround'))}>
                            5 Angle
                          </Button>
                        </>
                      )}
                      {(blueprint.kind === 'object' || blueprint.kind === 'vehicle') && (
                        <>
                          <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('image', blueprint.slug, 'object sheet'))}>
                            Object Sheet
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('image', blueprint.slug, 'five angle object turnaround'))}>
                            5 Angle
                          </Button>
                        </>
                      )}
                      {(blueprint.kind === 'location' || blueprint.kind === 'environment') && (
                        <Button size="sm" variant="outline" className="h-8 rounded-xl border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => navigate(buildKanvasHref('worldview', blueprint.slug, 'generate world'))}>
                          World
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
      <FinalizeAssetDialog
        open={Boolean(finalizeSource)}
        onOpenChange={(open) => {
          if (!open) setFinalizeSource(null);
        }}
        source={finalizeSource}
        onFinalized={() => setFinalizeSource(null)}
      />
    </div>
  );
}
