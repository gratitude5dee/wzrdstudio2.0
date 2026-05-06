import { ArrowUpRight, Image as ImageIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ipfsUriToGatewayUrl } from '@/lib/story/constants';
import type { IPVaultItem } from '@/types/ip-vault';
import { CopyButton } from '../CopyButton';
import { formatHash, formatIp, LICENSE_LABELS, previewUrl, statusClass, STATUS_LABELS } from '../ip-vault-utils';

interface Props {
  item: IPVaultItem;
}

function FieldRow({ label, value, copyLabel }: { label: string; value: string | null; copyLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="flex items-center gap-1 font-mono text-zinc-300">
        {value ? formatHash(value) : '—'}
        <CopyButton value={value} label={copyLabel ?? label} />
      </span>
    </div>
  );
}

export function IPVaultOverviewTab({ item }: Props) {
  const url = previewUrl(item);

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.06] bg-black/50">
        {url ? (
          <img src={url} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-14 w-14 text-zinc-700" />
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className={statusClass(item.registration_status)}>
            {STATUS_LABELS[item.registration_status]}
          </Badge>
          <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300 capitalize">
            {item.asset_kind}
          </Badge>
          <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-400">
            {item.source_type.replace(/_/g, ' ')}
          </Badge>
          {item.license_profile !== 'none' && (
            <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-zinc-300">
              {LICENSE_LABELS[item.license_profile]}
            </Badge>
          )}
        </div>
        <h2 className="text-xl font-semibold text-white">{item.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{item.description ?? 'No description added.'}</p>
      </div>

      <Separator className="bg-white/[0.08]" />

      <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-xs">
        <FieldRow label="IP ID" value={item.ip_id} copyLabel="IP ID" />
        <FieldRow label="Token ID" value={item.token_id} copyLabel="Token ID" />
        <FieldRow label="NFT Contract" value={item.nft_contract} copyLabel="NFT Contract" />
        <FieldRow label="Tx Hash" value={item.tx_hash} copyLabel="Transaction Hash" />
      </div>

      <div className="space-y-2">
        {item.story_explorer_url && (
          <a
            href={item.story_explorer_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-xs text-lime-100 hover:bg-lime-300/15"
          >
            View on StoryScan
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
        {item.ip_metadata_uri && (
          <a
            href={ipfsUriToGatewayUrl(item.ip_metadata_uri) ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            IP metadata (IPFS)
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
        {item.nft_metadata_uri && (
          <a
            href={ipfsUriToGatewayUrl(item.nft_metadata_uri) ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            NFT metadata (IPFS)
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
