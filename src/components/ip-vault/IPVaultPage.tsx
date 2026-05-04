import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  Filter,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ipfsUriToGatewayUrl, ROYALTY_POLICY_LAP_ADDRESS } from '@/lib/story/constants';
import { claimVaultRevenueOnStory, registerVaultItemOnStory } from '@/lib/story/registration';
import { cn } from '@/lib/utils';
import { ipVaultService } from '@/services/ipVaultService';
import { useStoryProtocolClient } from '@/hooks/useStoryProtocolClient';
import type { IPVaultItem, IPVaultLicenseProfile, IPVaultRelationshipType } from '@/types/ip-vault';
import { IPVaultVoiceBridge } from './IPVaultVoiceBridge';

type StatusFilter = 'all' | IPVaultItem['registration_status'];

const LICENSE_LABELS: Record<IPVaultLicenseProfile, string> = {
  none: 'No public license',
  non_commercial_social_remix: 'Non-commercial remix',
  commercial_use: 'Commercial use',
  commercial_remix: 'Commercial remix',
  creative_commons_attribution: 'CC BY',
};

const STATUS_LABELS: Record<IPVaultItem['registration_status'], string> = {
  draft: 'Draft',
  metadata_ready: 'Metadata ready',
  registering: 'Registering',
  registered: 'Registered',
  failed: 'Failed',
};

function previewUrl(item: IPVaultItem): string | null {
  return ipfsUriToGatewayUrl(item.thumbnail_url) ?? ipfsUriToGatewayUrl(item.media_url);
}

function statusClass(status: IPVaultItem['registration_status']) {
  if (status === 'registered') return 'border-lime-300/30 bg-lime-300/10 text-lime-200';
  if (status === 'failed') return 'border-red-400/30 bg-red-400/10 text-red-200';
  if (status === 'metadata_ready') return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200';
  if (status === 'registering') return 'border-orange-300/30 bg-orange-300/10 text-orange-200';
  return 'border-white/10 bg-white/[0.04] text-zinc-300';
}

function formatIp(id: string | null): string {
  if (!id) return 'Not registered';
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export function IPVaultPage() {
  const storyWallet = useStoryProtocolClient();
  const [items, setItems] = useState<IPVaultItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const registeredParents = useMemo(
    () => items.filter((item) => item.registration_status === 'registered' && item.ip_id),
    [items],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.registration_status !== statusFilter) return false;
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        return `${item.title} ${item.asset_kind} ${item.description ?? ''}`.toLowerCase().includes(term);
      }
      return true;
    });
  }, [items, search, statusFilter]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const rows = await ipVaultService.list();
      setItems(rows);
      if (!selectedId && rows[0]) setSelectedId(rows[0].id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load IP Vault.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const replaceItem = (item: IPVaultItem) => {
    setItems((current) => {
      const exists = current.some((candidate) => candidate.id === item.id);
      return exists
        ? current.map((candidate) => (candidate.id === item.id ? item : candidate))
        : [item, ...current];
    });
    setSelectedId(item.id);
  };

  const updateRights = async (patch: {
    licenseProfile?: IPVaultLicenseProfile;
    relationshipType?: IPVaultRelationshipType;
    parentIpIds?: string[];
    licenseTermsIds?: string[];
    commercialRevShare?: number | null;
    mintingFeeWip?: number | null;
  }) => {
    if (!selectedItem) return;
    const updated = await ipVaultService.updateRights(selectedItem.id, {
      licenseProfile: patch.licenseProfile ?? selectedItem.license_profile,
      relationshipType: patch.relationshipType ?? selectedItem.relationship_type,
      parentIpIds: patch.parentIpIds ?? selectedItem.parent_ip_ids,
      licenseTermsIds: patch.licenseTermsIds ?? selectedItem.license_terms_ids,
      royaltyPolicy: selectedItem.royalty_policy ?? ROYALTY_POLICY_LAP_ADDRESS,
      commercialRevShare: patch.commercialRevShare ?? selectedItem.commercial_rev_share,
      mintingFeeWip: patch.mintingFeeWip ?? selectedItem.minting_fee_wip,
    });
    replaceItem(updated);
  };

  const handlePrepareMetadata = async (item: IPVaultItem) => {
    setActionLoading('metadata');
    try {
      const result = await ipVaultService.pinStoryMetadata(item.id);
      replaceItem(result.item);
      toast.success('Story metadata pinned to IPFS.');
      return result.item;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pin Story metadata.');
      throw error;
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegister = async (item: IPVaultItem) => {
    if (!storyWallet.isConnected) {
      toast.error('Connect a wallet before registering IP.');
      return;
    }
    if (!storyWallet.isOnAeneid) {
      toast.error('Switch wallet to Story Aeneid first.');
      return;
    }

    setActionLoading('register');
    try {
      let prepared = item;
      if (!prepared.ip_metadata_uri || !prepared.nft_metadata_uri) {
        prepared = await handlePrepareMetadata(item);
      }

      replaceItem(await ipVaultService.markRegistering(prepared.id));
      const client = await storyWallet.createStoryClient();
      const result = await registerVaultItemOnStory(client, prepared, {
        walletAddress: storyWallet.address,
      });
      const registered = await ipVaultService.persistRegistration(prepared.id, result);
      replaceItem(registered);
      toast.success('IP registered on Story Protocol.');
    } catch (error) {
      await ipVaultService.markRegistrationFailed(item.id, error instanceof Error ? error.message : 'Registration failed.');
      await loadItems();
      toast.error(error instanceof Error ? error.message : 'Story registration failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimRevenue = async (item: IPVaultItem) => {
    if (!storyWallet.address) {
      toast.error('Connect a wallet before claiming revenue.');
      return;
    }
    setActionLoading('claim');
    try {
      const client = await storyWallet.createStoryClient();
      const result = await claimVaultRevenueOnStory(client, item, storyWallet.address);
      toast.success(result.txHash ? `Claim submitted: ${result.txHash.slice(0, 10)}...` : 'Claim submitted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Revenue claim failed.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080b] text-white" data-testid="ip-vault-page">
      <IPVaultVoiceBridge
        items={items}
        selectedItem={selectedItem}
        onSelectItem={(itemId) => setSelectedId(itemId)}
        onRefresh={loadItems}
        onUpdateRights={updateRights}
        onRegister={handleRegister}
        onClaimRevenue={handleClaimRevenue}
      />

      <div className="border-b border-white/[0.08] bg-[#0c0c10]/95 px-4 py-5 backdrop-blur md:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              IP Vault
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Rights registry for finalized WorldStudio assets
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              Finalized assets stay private until you connect a wallet, pin metadata, and confirm a Story transaction.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-300">
              {items.length} finalized
            </Badge>
            <Badge variant="outline" className="border-lime-300/20 bg-lime-300/10 text-lime-200">
              {items.filter((item) => item.registration_status === 'registered').length} registered
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={loadItems}
              disabled={loading}
              className="gap-2 border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <main className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search finalized IP..."
                className="h-10 rounded-xl border-white/10 bg-black/40 pl-9 text-white"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="h-10 rounded-xl border-white/10 bg-black/40 text-white">
                <Filter className="mr-2 h-4 w-4 text-zinc-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="metadata_ready">Metadata ready</SelectItem>
                <SelectItem value="registered">Registered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.02]">
              <Loader2 className="h-7 w-7 animate-spin text-orange-300" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.1] bg-white/[0.02] p-8 text-center">
              <FileCheck2 className="mb-4 h-12 w-12 text-zinc-600" />
              <h2 className="text-lg font-semibold text-white">No finalized IP yet</h2>
              <p className="mt-2 max-w-md text-sm text-zinc-500">
                Use Finalize asset from Asset Store, Character Creation, or Final Export surfaces to add rights-ready work here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((item) => {
                const url = previewUrl(item);
                const isSelected = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'overflow-hidden rounded-2xl border bg-[#101015] text-left transition-all',
                      isSelected ? 'border-orange-300 shadow-[0_0_0_2px_rgba(251,146,60,0.15)]' : 'border-white/[0.08]',
                      'hover:border-orange-300/45 hover:bg-[#15151b]',
                    )}
                    data-testid="ip-vault-item-card"
                  >
                    <div className="relative aspect-[4/3] bg-black/50">
                      {url ? (
                        <img src={url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-10 w-10 text-zinc-700" />
                        </div>
                      )}
                      <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className={cn('text-[10px]', statusClass(item.registration_status))}>
                          {STATUS_LABELS[item.registration_status]}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                        {item.registration_status === 'registered' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-300" />
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 capitalize text-zinc-400">
                          {item.asset_kind}
                        </span>
                        <span className="font-mono text-zinc-500">{formatIp(item.ip_id)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="h-fit rounded-3xl border border-white/[0.08] bg-[#0d0d12]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          {!selectedItem ? (
            <div className="py-12 text-center text-sm text-zinc-500">Select a vault item.</div>
          ) : (
            <div className="space-y-5" data-testid="ip-vault-detail">
              <div>
                <Badge variant="outline" className={cn('mb-3', statusClass(selectedItem.registration_status))}>
                  {STATUS_LABELS[selectedItem.registration_status]}
                </Badge>
                <h2 className="text-xl font-semibold text-white">{selectedItem.title}</h2>
                <p className="mt-1 text-sm text-zinc-500">{selectedItem.description ?? 'No description added.'}</p>
              </div>

              <Separator className="bg-white/[0.08]" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Story registration</p>
                  <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-400">
                    Aeneid
                  </Badge>
                </div>

                <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-xs text-zinc-400">
                  <div className="flex items-center justify-between">
                    <span>Wallet</span>
                    <span className={storyWallet.isConnected ? 'text-lime-300' : 'text-zinc-500'}>
                      {storyWallet.address ? `${storyWallet.address.slice(0, 6)}...${storyWallet.address.slice(-4)}` : 'Required'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Network</span>
                    <span className={storyWallet.isOnAeneid ? 'text-lime-300' : 'text-orange-300'}>
                      {storyWallet.isOnAeneid ? 'Story Aeneid' : 'Switch required'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Metadata</span>
                    <span className={selectedItem.ip_metadata_uri ? 'text-lime-300' : 'text-zinc-500'}>
                      {selectedItem.ip_metadata_uri ? 'Pinned' : 'Not pinned'}
                    </span>
                  </div>
                </div>

                {!storyWallet.isOnAeneid && storyWallet.isConnected ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void storyWallet.switchToAeneid()}
                    disabled={storyWallet.isSwitching}
                    className="w-full gap-2 border-orange-300/20 bg-orange-300/10 text-orange-100 hover:bg-orange-300/15"
                  >
                    {storyWallet.isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    Switch to Story Aeneid
                  </Button>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePrepareMetadata(selectedItem)}
                    disabled={Boolean(actionLoading) || selectedItem.registration_status === 'registered'}
                    className="gap-2 border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                  >
                    {actionLoading === 'metadata' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                    Pin metadata
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleRegister(selectedItem)}
                    disabled={Boolean(actionLoading) || selectedItem.registration_status === 'registered'}
                    className="gap-2 bg-orange-400 text-black hover:bg-orange-300"
                    data-testid="ip-vault-register-button"
                  >
                    {actionLoading === 'register' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Register IP
                  </Button>
                </div>
              </div>

              <Separator className="bg-white/[0.08]" />

              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Licensing</p>
                <Select
                  value={selectedItem.license_profile}
                  onValueChange={(value) => void updateRights({ licenseProfile: value as IPVaultLicenseProfile })}
                >
                  <SelectTrigger className="rounded-2xl border-white/10 bg-black/40 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LICENSE_LABELS) as IPVaultLicenseProfile[]).map((profile) => (
                      <SelectItem key={profile} value={profile}>
                        {LICENSE_LABELS[profile]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(selectedItem.license_profile === 'commercial_use' ||
                  selectedItem.license_profile === 'commercial_remix') ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-zinc-500">Mint fee WIP</Label>
                      <Input
                        value={selectedItem.minting_fee_wip ?? 0}
                        type="number"
                        min="0"
                        step="0.01"
                        onChange={(event) => void updateRights({ mintingFeeWip: Number(event.target.value) })}
                        className="rounded-xl border-white/10 bg-black/40 text-white"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-zinc-500">Rev share %</Label>
                      <Input
                        value={selectedItem.commercial_rev_share ?? 5}
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        onChange={(event) => void updateRights({ commercialRevShare: Number(event.target.value) })}
                        className="rounded-xl border-white/10 bg-black/40 text-white"
                        disabled={selectedItem.license_profile !== 'commercial_remix'}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <Separator className="bg-white/[0.08]" />

              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Derivative relationship</p>
                <Select
                  value={selectedItem.relationship_type}
                  onValueChange={(value) => void updateRights({ relationshipType: value as IPVaultRelationshipType })}
                >
                  <SelectTrigger className="rounded-2xl border-white/10 bg-black/40 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Root IP</SelectItem>
                    <SelectItem value="derivative">Derivative</SelectItem>
                    <SelectItem value="remix">Remix</SelectItem>
                    <SelectItem value="adaptation">Adaptation</SelectItem>
                  </SelectContent>
                </Select>

                {selectedItem.relationship_type !== 'root' ? (
                  <Select
                    value={selectedItem.parent_ip_ids[0] ?? ''}
                    onValueChange={(value) => {
                      const parent = registeredParents.find((item) => item.ip_id === value);
                      void updateRights({
                        parentIpIds: value ? [value] : [],
                        licenseTermsIds: parent?.license_terms_ids.length ? [parent.license_terms_ids[0]] : ['1'],
                      });
                    }}
                  >
                    <SelectTrigger className="rounded-2xl border-white/10 bg-black/40 text-white">
                      <SelectValue placeholder="Select registered parent" />
                    </SelectTrigger>
                    <SelectContent>
                      {registeredParents.map((parent) => (
                        <SelectItem key={parent.id} value={parent.ip_id ?? ''}>
                          {parent.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              <Separator className="bg-white/[0.08]" />

              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Rights checklist</p>
                {[
                  ['Finalized source', true],
                  ['Metadata pinned', Boolean(selectedItem.ip_metadata_uri)],
                  ['Wallet confirmed', selectedItem.registration_status === 'registered'],
                  ['License selected', selectedItem.license_profile !== 'none'],
                ].map(([label, complete]) => (
                  <div key={String(label)} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                    <span className="text-zinc-300">{label}</span>
                    {complete ? <CheckCircle2 className="h-4 w-4 text-lime-300" /> : <AlertCircle className="h-4 w-4 text-zinc-600" />}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {selectedItem.story_explorer_url ? (
                  <a
                    href={selectedItem.story_explorer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-xl border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-xs text-lime-100 hover:bg-lime-300/15"
                  >
                    Story explorer
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {selectedItem.ip_metadata_uri ? (
                  <a
                    href={ipfsUriToGatewayUrl(selectedItem.ip_metadata_uri) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06]"
                  >
                    IP metadata proof
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClaimRevenue(selectedItem)}
                disabled={Boolean(actionLoading) || selectedItem.registration_status !== 'registered'}
                className="w-full gap-2 border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
              >
                {actionLoading === 'claim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Claim revenue
              </Button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
