import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Heart, Loader2, ShieldCheck, Sparkles, Trash2, Upload, User2 } from 'lucide-react';
import { toast } from 'sonner';

import { FinalizeAssetDialog } from '@/components/ip-vault/FinalizeAssetDialog';
import { cn } from '@/lib/utils';
import { useUserTier } from '@/hooks/useUserTier';
import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { assetService } from '@/services/assetService';
import {
  addBlueprintImage,
  createReusableBlueprintElement,
  deleteBlueprint,
  generateCharacterImage,
  listBlueprintImages,
  updateBlueprintRecord,
} from '@/services/characterBlueprintService';
import type { CharacterBlueprintImage } from '@/types/character-creation';

// ---------------------------------------------------------------------------
// CharacterDetail — Full view of a saved character blueprint
// ---------------------------------------------------------------------------

export function CharacterDetail() {
  const {
    blueprints,
    selectedBlueprintId,
    setMode,
    selectBlueprint,
    removeBlueprint,
    toggleFavorite,
    updateBlueprint,
  } =
    useCharacterCreationStore();
  const { tier } = useUserTier();
  const [referenceImages, setReferenceImages] = useState<CharacterBlueprintImage[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [generatingPortrait, setGeneratingPortrait] = useState(false);
  const [creatingElement, setCreatingElement] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const blueprint = blueprints.find((b) => b.id === selectedBlueprintId);
  const canCreateElement = Boolean(blueprint?.imageUrl && referenceImages.length > 0);
  const referenceImageUrls = useMemo(
    () => referenceImages.map((image) => image.imageUrl).filter(Boolean),
    [referenceImages]
  );

  useEffect(() => {
    if (!blueprint?.id) {
      setReferenceImages([]);
      return;
    }

    let cancelled = false;
    setLoadingReferences(true);
    listBlueprintImages(blueprint.id)
      .then((images) => {
        if (!cancelled) {
          setReferenceImages(images);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load reference images.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingReferences(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [blueprint?.id]);

  if (!blueprint) {
    return (
      <div className="py-16 text-center text-sm text-zinc-400">
        Character not found.
        <button
          type="button"
          onClick={() => setMode('gallery')}
          className="ml-2 text-lime-300 hover:underline"
        >
          Back to library
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteBlueprint(blueprint.id);
      removeBlueprint(blueprint.id);
      toast.success(`"${blueprint.name}" deleted.`);
      setMode('gallery');
    } catch {
      toast.error('Failed to delete character.');
    }
  };

  const handleToggleFavorite = async () => {
    toggleFavorite(blueprint.id);
    try {
      const updated = await updateBlueprintRecord(blueprint.id, { isFavorite: !blueprint.isFavorite });
      updateBlueprint(updated.id, updated);
    } catch {
      toggleFavorite(blueprint.id); // revert
    }
  };

  const handleCopyMention = () => {
    navigator.clipboard.writeText(`@${blueprint.slug}`);
    toast.success(`Copied @${blueprint.slug} to clipboard`);
  };

  const handleGeneratePortrait = async () => {
    setGeneratingPortrait(true);
    try {
      const imageUrl = await generateCharacterImage(blueprint.promptFragment, {
        tier,
        projectId: blueprint.projectId ?? undefined,
      });
      if (!imageUrl) {
        throw new Error('Portrait generation did not return an image.');
      }

      const updated = await updateBlueprintRecord(blueprint.id, {
        imageUrl,
        thumbnailUrl: imageUrl,
      });
      updateBlueprint(updated.id, updated);
      toast.success('Portrait generated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate portrait.');
    } finally {
      setGeneratingPortrait(false);
    }
  };

  const handleReferenceUpload = async (file: File) => {
    setUploadingReference(true);
    try {
      const base64 = await assetService.fileToBase64(file);
      const upload = await assetService.upload({
        projectId: blueprint.projectId ?? undefined,
        assetType: 'image',
        assetCategory: 'upload',
        visibility: 'private',
        file: {
          name: file.name,
          type: file.type,
          size: file.size,
          base64,
        },
      });

      const imageUrl = upload.asset?.cdn_url;
      if (!imageUrl) {
        throw new Error('Upload completed without a usable image URL.');
      }

      const record = await addBlueprintImage({
        blueprintId: blueprint.id,
        imageUrl,
        label: file.name,
      });

      setReferenceImages((current) =>
        [...current, record].sort((left, right) => left.sortOrder - right.sortOrder)
      );
      toast.success('Reference image added.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload reference image.');
    } finally {
      setUploadingReference(false);
    }
  };

  const handleCreateReusableElement = async () => {
    if (!canCreateElement) {
      return;
    }

    setCreatingElement(true);
    updateBlueprint(blueprint.id, {
      gmiElementStatus: 'processing',
      gmiElementError: null,
      gmiElementUpdatedAt: new Date().toISOString(),
    });

    try {
      const updated = await createReusableBlueprintElement({
        blueprint,
        referenceImageUrls,
        projectId: blueprint.projectId,
      });
      updateBlueprint(updated.id, updated);
      toast.success('Reusable GMI element created.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create reusable element.';
      updateBlueprint(blueprint.id, {
        gmiElementStatus: 'failed',
        gmiElementError: message,
        gmiElementUpdatedAt: new Date().toISOString(),
      });
      toast.error(message);
    } finally {
      setCreatingElement(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        type="button"
        onClick={() => selectBlueprint(null)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Library
      </button>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Image */}
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
          {blueprint.imageUrl ? (
            <img
              src={blueprint.imageUrl}
              alt={blueprint.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User2 className="h-24 w-24 text-zinc-700" />
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-white">{blueprint.name}</h2>
            <p className="mt-1 text-sm text-zinc-400">
              <span className="text-lime-300/70">@{blueprint.slug}</span>
              <span className="mx-2 text-zinc-600">·</span>
              {blueprint.kind}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyMention}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06]"
            >
              <Copy className="h-3 w-3" />
              Copy @mention
            </button>
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs',
                blueprint.isFavorite
                  ? 'border-lime-300/40 bg-lime-300/10 text-lime-300'
                  : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]',
              )}
            >
              <Heart className={cn('h-3 w-3', blueprint.isFavorite && 'fill-current')} />
              {blueprint.isFavorite ? 'Favorited' : 'Favorite'}
            </button>
            <button
              type="button"
              onClick={() => void handleGeneratePortrait()}
              disabled={generatingPortrait}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-60"
            >
              {generatingPortrait ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Generate Portrait
            </button>
            <button
              type="button"
              onClick={() => setFinalizeOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-orange-300/20 bg-orange-300/10 px-3 py-2 text-xs text-orange-100 hover:bg-orange-300/15"
            >
              <ShieldCheck className="h-3 w-3" />
              Finalize asset
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>

          {/* Prompt fragment */}
          {blueprint.promptFragment && (
            <div className="rounded-2xl border border-lime-300/20 bg-lime-300/5 p-4">
              <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-lime-300/70">
                <Sparkles className="h-3 w-3" />
                Prompt Fragment
              </p>
              <p className="text-sm leading-relaxed text-white">{blueprint.promptFragment}</p>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                  Reference Images
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Upload 1–3 alternate views before creating the reusable GMI element.
                </p>
              </div>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (file) {
                    void handleReferenceUpload(file);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                disabled={uploadingReference}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-60"
              >
                {uploadingReference ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Add Reference
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {loadingReferences ? (
                <div className="col-span-full rounded-xl border border-white/5 bg-black/20 px-4 py-6 text-center text-xs text-zinc-500">
                  Loading references…
                </div>
              ) : referenceImages.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-xs text-zinc-500">
                  No reference images yet.
                </div>
              ) : (
                referenceImages.map((image) => (
                  <div key={image.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <img src={image.imageUrl} alt={image.label ?? blueprint.name} className="h-36 w-full object-cover" />
                    <div className="px-3 py-2">
                      <p className="truncate text-xs text-zinc-300">{image.label ?? 'Reference image'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-orange-400/20 bg-orange-400/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-orange-300/70">
                  Reusable GMI Element
                </p>
                <p className="mt-1 text-sm text-white">
                  {blueprint.gmiElementId ? `Element ID: ${blueprint.gmiElementId}` : 'No reusable element created yet.'}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Status: {blueprint.gmiElementStatus ?? 'idle'}
                  {blueprint.gmiElementUpdatedAt ? ` · Updated ${new Date(blueprint.gmiElementUpdatedAt).toLocaleString()}` : ''}
                </p>
                {blueprint.gmiElementError && (
                  <p className="mt-2 text-xs text-red-400">{blueprint.gmiElementError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleCreateReusableElement()}
                disabled={!canCreateElement || creatingElement}
                className="flex items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-xs text-orange-300 hover:bg-orange-400/15 disabled:opacity-50"
              >
                {creatingElement ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Create Reusable Element
              </button>
            </div>
          </div>

          {/* Trait summary */}
          <div className="grid gap-3 sm:grid-cols-2">
            <TraitBlock label="Type" value={blueprint.traits.characterType} />
            <TraitBlock label="Gender" value={blueprint.traits.gender} />
            <TraitBlock label="Ethnicity" value={blueprint.traits.ethnicity} />
            <TraitBlock label="Skin" value={blueprint.traits.skinColor} />
            <TraitBlock label="Condition" value={blueprint.traits.skinCondition} />
            <TraitBlock label="Age" value={blueprint.traits.age} />
            <TraitBlock label="Eyes" value={blueprint.faceDetails.eyeType} />
            <TraitBlock label="Eye Detail" value={blueprint.faceDetails.eyeDetail} />
            <TraitBlock label="Build" value={blueprint.bodyDetails.build} />
            <TraitBlock label="Art Style" value={blueprint.styleDetails.artStyle} />
          </div>

          {/* Usage */}
          <p className="text-xs text-zinc-500">
            Used {blueprint.usageCount} time{blueprint.usageCount !== 1 ? 's' : ''} across prompts
          </p>
        </div>
      </div>
      <FinalizeAssetDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        source={{
          sourceType: 'character_blueprint',
          sourceId: blueprint.id,
          title: blueprint.name,
          description: blueprint.promptFragment,
          assetKind: blueprint.kind === 'environment' ? 'location' : blueprint.kind,
          previewUrl: blueprint.thumbnailUrl ?? blueprint.imageUrl,
        }}
        onFinalized={() => setFinalizeOpen(false)}
      />
    </div>
  );
}

function TraitBlock({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-xs text-zinc-200">{value}</p>
    </div>
  );
}
