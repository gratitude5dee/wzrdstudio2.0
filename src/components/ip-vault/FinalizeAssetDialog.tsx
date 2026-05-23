import { useEffect, useMemo, useState } from 'react';
import { Archive, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ipVaultService } from '@/services/ipVaultService';
import type { FinalizeIPVaultSourceInput, IPVaultItem, IPVaultSourceType } from '@/types/ip-vault';

interface FinalizeAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: {
    sourceType: IPVaultSourceType;
    sourceId: string;
    title?: string;
    description?: string | null;
    assetKind?: string;
    previewUrl?: string | null;
  } | null;
  onFinalized?: (item: IPVaultItem) => void;
}

const ASSET_KINDS = [
  'character',
  'object',
  'location',
  'video',
  'image',
  'audio',
  'scene',
  'asset',
];

export function FinalizeAssetDialog({
  open,
  onOpenChange,
  source,
  onFinalized,
}: FinalizeAssetDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assetKind, setAssetKind] = useState('asset');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!source || !open) return;
    setTitle(source.title ?? '');
    setDescription(source.description ?? '');
    setAssetKind(source.assetKind ?? 'asset');
  }, [open, source]);

  const canSubmit = Boolean(source?.sourceId && title.trim() && assetKind.trim());
  const previewIsVideo = useMemo(() => {
    const url = source?.previewUrl ?? '';
    return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
  }, [source?.previewUrl]);

  const handleFinalize = async () => {
    if (!source || !canSubmit) return;

    setSaving(true);
    try {
      const input: FinalizeIPVaultSourceInput = {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        title: title.trim(),
        description: description.trim() || null,
        assetKind,
      };
      const item = await ipVaultService.finalizeSource(input);
      toast.success(`${item.title} added to IP Vault.`);
      onFinalized?.(item);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to finalize asset.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0d0d11] text-white sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl border border-orange-300/20 bg-orange-300/10">
            <ShieldCheck className="h-5 w-5 text-orange-300" />
          </div>
          <DialogTitle>Finalize asset</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Add this source to IP Vault before Story Protocol registration.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {source?.previewUrl ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              {previewIsVideo ? (
                <video src={source.previewUrl} className="h-44 w-full object-cover" muted playsInline preload="metadata" />
              ) : (
                <img src={source.previewUrl} alt={title || 'Asset preview'} className="h-44 w-full object-cover" />
              )}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/30">
              <Archive className="h-8 w-8 text-zinc-600" />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="ip-vault-title" className="text-xs text-zinc-400">
              Title
            </Label>
            <Input
              id="ip-vault-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-2xl border-white/10 bg-black/40 text-white"
              placeholder="Asset title"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs text-zinc-400">Asset kind</Label>
            <Select value={assetKind} onValueChange={setAssetKind}>
              <SelectTrigger className="rounded-2xl border-white/10 bg-black/40 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ip-vault-description" className="text-xs text-zinc-400">
              Description
            </Label>
            <Textarea
              id="ip-vault-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="resize-none rounded-2xl border-white/10 bg-black/40 text-white"
              placeholder="Ownership notes, provenance, and usage intent"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleFinalize}
            disabled={!canSubmit || saving}
            className="gap-2 bg-orange-400 text-black hover:bg-orange-300"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Finalize asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
