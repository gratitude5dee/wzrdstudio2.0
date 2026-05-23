import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import type { IPVaultItem } from '@/types/ip-vault';
import { CopyButton } from '../CopyButton';
import { formatHash } from '../ip-vault-utils';

interface Props {
  item: IPVaultItem;
}

function ProofRow({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value ?? '—';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="flex items-center gap-1 truncate font-mono text-zinc-300">
        <span className="truncate">{typeof value === 'string' && value.length > 18 ? formatHash(value) : display}</span>
        <CopyButton value={value ?? null} label={label} />
      </span>
    </div>
  );
}

export function IPVaultProofTab({ item }: Props) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const registrationError =
    typeof item.proof_packet.registrationError === 'string' ? item.proof_packet.registrationError : null;
  const registeredAt =
    typeof item.proof_packet.registeredAt === 'string' ? item.proof_packet.registeredAt : null;
  const failedAt =
    typeof item.proof_packet.failedAt === 'string' ? item.proof_packet.failedAt : null;

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Source provenance</p>

      <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-xs">
        <ProofRow label="Source type" value={item.source_type} />
        <ProofRow label="Source ID" value={item.source_id} />
        <ProofRow label="Project ID" value={item.project_id} />
      </div>

      <Separator className="bg-white/[0.08]" />

      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Media &amp; metadata hashes</p>

      <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-xs">
        <ProofRow label="Media URL" value={item.media_url} />
        <ProofRow label="Thumbnail" value={item.thumbnail_url} />
        <ProofRow label="Media hash" value={item.media_hash} />
        <ProofRow label="IP metadata URI" value={item.ip_metadata_uri} />
        <ProofRow label="IP metadata hash" value={item.ip_metadata_hash} />
        <ProofRow label="NFT metadata URI" value={item.nft_metadata_uri} />
        <ProofRow label="NFT metadata hash" value={item.nft_metadata_hash} />
      </div>

      <Separator className="bg-white/[0.08]" />

      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Registration</p>

      <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-xs">
        <ProofRow label="Tx hash" value={item.tx_hash} />
        {registeredAt && <ProofRow label="Registered at" value={new Date(registeredAt).toLocaleString()} />}
        {failedAt && <ProofRow label="Failed at" value={new Date(failedAt).toLocaleString()} />}
      </div>

      {registrationError && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">
          <p className="font-semibold">Error</p>
          <p className="mt-1 text-red-300/80">{registrationError}</p>
        </div>
      )}

      <Collapsible open={jsonOpen} onOpenChange={setJsonOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.04]">
          <span>Raw proof packet</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${jsonOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 max-h-[300px] overflow-auto rounded-xl border border-white/[0.06] bg-black/30 p-3 text-[10px] text-zinc-400">
            {JSON.stringify(item.proof_packet, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
