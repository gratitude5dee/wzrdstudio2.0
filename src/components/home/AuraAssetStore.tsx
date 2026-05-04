import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AtSign,
  Boxes,
  Check,
  Copy,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  User2,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { appRoutes } from '@/lib/routes';
import { toSlug, useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { cn } from '@/lib/utils';
import { assetService } from '@/services/assetService';
import { createBlueprint, listBlueprints } from '@/services/characterBlueprintService';
import type { Project } from '@/components/home/ProjectCard';
import type { AssetCategory, AssetType, ProjectAsset } from '@/types/assets';
import type { CharacterBlueprint, CharacterKind } from '@/types/character-creation';

type StoreKind = Extract<CharacterKind, 'character' | 'location' | 'object'>;
type TypeFilter = 'all' | Extract<AssetType, 'image' | 'video'>;
type CategoryFilter = 'all' | AssetCategory;

interface AuraAssetStoreProps {
  projects?: Project[];
}

const KIND_META: Record<StoreKind, { label: string; icon: typeof User2; seed: string }> = {
  character: {
    label: 'Character',
    icon: User2,
    seed: 'CHARACTER ANCHOR: name, age range, face shape, eyes, hair, body build, signature clothing, style target.',
  },
  location: {
    label: 'Location',
    icon: MapPin,
    seed: 'LOCATION ANCHOR: place type, geography, architecture, era, lighting, palette, mood, signature landmarks.',
  },
  object: {
    label: 'Object',
    icon: Boxes,
    seed: 'OBJECT ANCHOR: object type, silhouette, material, color, markings, wear, scale, style target.',
  },
};

function getAssetPreviewUrl(asset: ProjectAsset): string | null {
  if (asset.asset_type === 'image') {
    return asset.thumbnail_url ?? asset.preview_url ?? asset.cdn_url;
  }
  if (asset.asset_type === 'video') {
    return asset.thumbnail_url ?? asset.preview_url;
  }
  return null;
}

function getCommonProjectId(assets: ProjectAsset[]): string | null {
  if (assets.length === 0) return null;
  const first = assets[0]?.project_id ?? null;
  return assets.every((asset) => (asset.project_id ?? null) === first) ? first : null;
}

function buildKanvasHref(studio: 'image' | 'video' | 'cinema' | 'character-creation', slug?: string) {
  const params = new URLSearchParams({ studio });
  if (slug) {
    params.set('prompt', `@${slug} `);
  }
  return `${appRoutes.kanvas}?${params.toString()}`;
}

export function AuraAssetStore({ projects = [] }: AuraAssetStoreProps) {
  const navigate = useNavigate();
  const addBlueprint = useCharacterCreationStore((state) => state.addBlueprint);
  const setBlueprints = useCharacterCreationStore((state) => state.setBlueprints);

  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [blueprints, setBlueprintList] = useState<CharacterBlueprint[]>([]);
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
  const [promptAnchor, setPromptAnchor] = useState(KIND_META.character.seed);
  const [referenceLabels, setReferenceLabels] = useState<Record<string, string>>({});

  const selectedAssets = useMemo(
    () => selectedIds.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is ProjectAsset => Boolean(asset)),
    [assets, selectedIds],
  );

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (typeFilter !== 'all' && asset.asset_type !== typeFilter) return false;
      if (categoryFilter !== 'all' && asset.asset_category !== categoryFilter) return false;
      if (projectFilter !== 'all' && asset.project_id !== projectFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const haystack = `${asset.original_file_name} ${asset.file_name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return Boolean(getAssetPreviewUrl(asset));
    });
  }, [assets, categoryFilter, projectFilter, searchQuery, typeFilter]);

  const slugPreview = toSlug(name);

  useEffect(() => {
    let cancelled = false;
    setLoadingAssets(true);
    setError(null);
    assetService
      .list({
        assetType: ['image', 'video'],
        processingStatus: ['completed'],
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: 200,
      })
      .then((rows) => {
        if (!cancelled) setAssets(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load assets.');
        }
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
        if (!cancelled) {
          setBlueprintList(rows);
          setBlueprints(rows);
        }
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
        const imageUrl = getAssetPreviewUrl(asset);
        if (!imageUrl) return null;
        return {
          assetId: asset.id,
          imageUrl,
          label: referenceLabels[asset.id] ?? asset.original_file_name,
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
        projectId: getCommonProjectId(selectedAssets),
        referenceImages,
      });

      addBlueprint(blueprint);
      setBlueprintList((current) => [blueprint, ...current.filter((item) => item.id !== blueprint.id)]);
      setSelectedIds([]);
      setReferenceLabels({});
      setName('');
      setPromptAnchor(KIND_META[kind].seed);
      toast.success(`Saved ${KIND_META[kind].label.toLowerCase()} @${blueprint.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save blueprint.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="aura-asset-store">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
            <Sparkles className="h-3.5 w-3.5" />
            Aura Asset Store
          </div>
          <h2 className="text-2xl font-semibold text-foreground">Reusable Characters, Locations, and Objects</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Select workspace assets, write the identity anchor, then save a blueprint for @mentions in Kanvas.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(buildKanvasHref('character-creation'))}
          className="gap-2"
        >
          <AtSign className="h-4 w-4" />
          Open Character Creation
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_420px]">
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_170px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search uploaded assets..."
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All media</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}>
              <SelectTrigger>
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
              <SelectTrigger>
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

          {loadingAssets ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center">
              <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">No usable image or video references found.</p>
              <p className="mt-1 text-xs text-muted-foreground">Upload assets in Kanvas or Studio, then return here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filteredAssets.map((asset) => {
                const previewUrl = getAssetPreviewUrl(asset);
                const selected = selectedIds.includes(asset.id);
                const project = projects.find((item) => item.id === asset.project_id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleAsset(asset)}
                    className={cn(
                      'group overflow-hidden rounded-xl border bg-card text-left transition-all hover:border-orange-400/40',
                      selected ? 'border-orange-400 ring-2 ring-orange-400/25' : 'border-border',
                    )}
                    data-testid="aura-asset-card"
                  >
                    <div className="relative aspect-square bg-muted">
                      {previewUrl ? (
                        <img src={previewUrl} alt={asset.original_file_name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {asset.asset_type === 'video' ? <Video className="h-8 w-8 text-muted-foreground" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                        </div>
                      )}
                      {selected && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-black">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      <p className="truncate text-xs font-medium">{asset.original_file_name}</p>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {asset.asset_type}
                        </Badge>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {project?.title ?? 'Workspace'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4 p-4">
            <div>
              <h3 className="text-lg font-semibold">Create Blueprint</h3>
              <p className="text-xs text-muted-foreground">Blueprints save references and prompt anchors only. Generation remains explicit in Kanvas.</p>
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
                      'rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                      kind === value ? 'border-orange-400 bg-orange-400/10 text-orange-300' : 'border-border hover:bg-muted',
                    )}
                  >
                    <Icon className="mx-auto mb-1 h-4 w-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name, e.g. Nova Pilot" />
              <p className="text-xs text-muted-foreground">
                Mention slug: <span className="font-mono text-orange-300">@{slugPreview || 'name'}</span>
              </p>
            </div>

            <Textarea
              value={promptAnchor}
              onChange={(event) => setPromptAnchor(event.target.value)}
              rows={6}
              placeholder="Write the reusable identity anchor..."
              className="resize-none"
            />

            {selectedAssets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reference labels</p>
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
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <Button type="button" onClick={handleSaveBlueprint} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Save Blueprint
            </Button>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Saved Blueprints</h3>
              {loadingBlueprints && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
              {blueprints.length === 0 && !loadingBlueprints ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No reusable blueprints yet.
                </p>
              ) : (
                blueprints.slice(0, 12).map((blueprint) => (
                  <div key={blueprint.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-lg bg-muted">
                        {blueprint.imageUrl ? (
                          <img src={blueprint.imageUrl} alt={blueprint.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <AtSign className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{blueprint.name}</p>
                          <Badge variant="outline" className="text-[10px] capitalize">{blueprint.kind}</Badge>
                        </div>
                        <p className="truncate font-mono text-xs text-orange-300">@{blueprint.slug}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{blueprint.promptFragment}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => navigator.clipboard.writeText(`@${blueprint.slug}`)}>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(buildKanvasHref('image', blueprint.slug))}>
                        Image
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(buildKanvasHref('video', blueprint.slug))}>
                        Video
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(buildKanvasHref('cinema', blueprint.slug))}>
                        Cinema
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
