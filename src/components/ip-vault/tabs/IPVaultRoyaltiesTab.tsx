import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ROYALTY_POLICY_LAP_ADDRESS, ROYALTY_POLICY_LRP_ADDRESS } from '@/lib/story/constants';
import type { IPVaultItem } from '@/types/ip-vault';
import { CopyButton } from '../CopyButton';
import { formatHash, formatIp } from '../ip-vault-utils';

interface Props {
  item: IPVaultItem;
  actionLoading: string | null;
  onClaimRevenue: () => void;
}

export function IPVaultRoyaltiesTab({ item, actionLoading, onClaimRevenue }: Props) {
  const isRegistered = item.registration_status === 'registered';
  const royaltyVaultAddress =
    item.royalty_vault_address ??
    (typeof item.proof_packet.story === 'object' && item.proof_packet.story
      ? (item.proof_packet.story as Record<string, unknown>).royaltyVaultAddress as string | null
      : null);

  const childIpIds = Array.isArray(item.proof_packet.childIpIds)
    ? (item.proof_packet.childIpIds as string[])
    : [];

  const policyLabel =
    item.royalty_policy === ROYALTY_POLICY_LRP_ADDRESS
      ? 'LRP (Liquid Relative)'
      : item.royalty_policy === ROYALTY_POLICY_LAP_ADDRESS
        ? 'LAP (Liquid Absolute)'
        : item.royalty_policy
          ? formatHash(item.royalty_policy)
          : 'Default (LAP)';

  if (!isRegistered) {
    return (
      <div className="py-8 text-center">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-sm text-zinc-500">Register this IP on Story before managing royalties.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Royalty details</p>

      <div className="grid gap-2 rounded-2xl border border-white/[0.06] bg-black/20 p-3 text-xs text-zinc-400">
        <div className="flex items-center justify-between">
          <span>Royalty policy</span>
          <span className="text-zinc-300">{policyLabel}</span>
        </div>
        {item.commercial_rev_share != null && (
          <div className="flex items-center justify-between">
            <span>Revenue share</span>
            <span className="text-zinc-300">{item.commercial_rev_share}%</span>
          </div>
        )}
        {royaltyVaultAddress && (
          <div className="flex items-center justify-between">
            <span>Vault address</span>
            <span className="flex items-center gap-1 font-mono text-zinc-300">
              {formatHash(royaltyVaultAddress)}
              <CopyButton value={royaltyVaultAddress} label="Vault address" />
            </span>
          </div>
        )}
      </div>

      {childIpIds.length > 0 && (
        <>
          <Separator className="bg-white/[0.08]" />
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Child IPs</p>
            <div className="space-y-1">
              {childIpIds.map((id) => (
                <div key={id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs">
                  <span className="font-mono text-zinc-400">{formatIp(id)}</span>
                  <CopyButton value={id} label="Child IP ID" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {item.last_claim_tx_hash && (
        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-zinc-400">
          <p>Last claim: <span className="font-mono text-zinc-300">{formatHash(item.last_claim_tx_hash)}</span></p>
          {item.last_claimed_at && (
            <p className="text-[10px] text-zinc-600">{new Date(item.last_claimed_at).toLocaleString()}</p>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={onClaimRevenue}
        disabled={Boolean(actionLoading)}
        className="w-full gap-2 border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
      >
        {actionLoading === 'claim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Claim revenue
      </Button>
    </div>
  );
}
