import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  Loader2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { IPVaultItem } from '@/types/ip-vault';
import type { StoryWalletState } from '@/hooks/useStoryProtocolClient';

interface Props {
  item: IPVaultItem;
  wallet: StoryWalletState;
  actionLoading: string | null;
  onPrepareMetadata: () => void;
  onRegister: () => void;
}

function StepRow({ label, done, hint }: { label: string; done: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
      <div>
        <span className="text-zinc-300">{label}</span>
        {!done && hint && <p className="mt-0.5 text-[10px] text-zinc-600">{hint}</p>}
      </div>
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-300" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-zinc-600" />
      )}
    </div>
  );
}

export function IPVaultRegistrationTab({ item, wallet, actionLoading, onPrepareMetadata, onRegister }: Props) {
  const isRegistered = item.registration_status === 'registered';
  const isFailed = item.registration_status === 'failed';
  const registrationError =
    typeof item.proof_packet.registrationError === 'string' ? item.proof_packet.registrationError : null;

  const steps = [
    { label: '1. Finalized source', done: true },
    { label: '2. Metadata pinned to IPFS', done: Boolean(item.ip_metadata_uri), hint: 'Pin metadata first' },
    { label: '3. Wallet connected', done: wallet.isConnected, hint: 'Connect a browser wallet' },
    { label: '4. Story Aeneid network', done: wallet.isOnAeneid, hint: 'Switch wallet to Story Aeneid' },
    { label: '5. License configured', done: item.license_profile !== 'none', hint: 'Select a license profile' },
    { label: '6. Transaction submitted', done: Boolean(item.tx_hash) },
    { label: '7. Registered on Story', done: isRegistered },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Registration progress</p>
        <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-400">Aeneid</Badge>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <StepRow key={step.label} label={step.label} done={step.done} hint={step.hint} />
        ))}
      </div>

      {isFailed && registrationError && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">
          <p className="font-semibold">Registration failed</p>
          <p className="mt-1 text-red-300/80">{registrationError}</p>
        </div>
      )}

      {!wallet.isOnAeneid && wallet.isConnected && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void wallet.switchToAeneid()}
          disabled={wallet.isSwitching}
          className="w-full gap-2 border-orange-300/20 bg-orange-300/10 text-orange-100 hover:bg-orange-300/15"
        >
          {wallet.isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Switch to Story Aeneid
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onPrepareMetadata}
          disabled={Boolean(actionLoading) || isRegistered}
          className="gap-2 border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
        >
          {actionLoading === 'metadata' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          Pin metadata
        </Button>
        <Button
          type="button"
          onClick={onRegister}
          disabled={Boolean(actionLoading) || isRegistered}
          className="gap-2 bg-orange-400 text-black hover:bg-orange-300"
          data-testid="ip-vault-register-button"
        >
          {actionLoading === 'register' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Register IP
        </Button>
      </div>

      {!wallet.isConnected && !isRegistered && (
        <p className="text-center text-[10px] text-zinc-600">Connect a wallet to register IP on Story Protocol.</p>
      )}
    </div>
  );
}
