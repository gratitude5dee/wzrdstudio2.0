import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  FileText,
  Loader2,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { IPVaultItem } from '@/types/ip-vault';
import type { StoryWalletState } from '@/hooks/useStoryProtocolClient';

interface IPVaultSummaryProps {
  items: IPVaultItem[];
  wallet: StoryWalletState;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
}

function MetricCard({ icon, label, value, accent }: MetricCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent ?? 'bg-white/[0.05] text-zinc-400'}`}>
        {icon}
      </div>
      <div>
        <p className="text-lg font-semibold text-white">{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

export function IPVaultSummary({ items, wallet }: IPVaultSummaryProps) {
  const total = items.length;
  const metadataReady = items.filter((i) => i.registration_status === 'metadata_ready').length;
  const registered = items.filter((i) => i.registration_status === 'registered').length;
  const failed = items.filter((i) => i.registration_status === 'failed').length;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="ip-vault-summary">
      <MetricCard
        icon={<FileText className="h-4 w-4" />}
        label="Total finalized"
        value={total}
      />
      <MetricCard
        icon={<FileCheck2 className="h-4 w-4" />}
        label="Metadata ready"
        value={metadataReady}
        accent="bg-cyan-400/10 text-cyan-300"
      />
      <MetricCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Registered"
        value={registered}
        accent="bg-lime-400/10 text-lime-300"
      />
      <MetricCard
        icon={<AlertCircle className="h-4 w-4" />}
        label="Failed"
        value={failed}
        accent={failed > 0 ? 'bg-red-400/10 text-red-300' : undefined}
      />
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${wallet.isConnected ? 'bg-lime-400/10 text-lime-300' : 'bg-white/[0.05] text-zinc-500'}`}>
          {wallet.isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : 'Not connected'}
          </p>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={`text-[9px] ${wallet.isOnAeneid ? 'border-lime-300/20 text-lime-300' : 'border-orange-300/20 text-orange-300'}`}
            >
              {wallet.isOnAeneid ? 'Aeneid' : wallet.isConnected ? 'Wrong network' : 'Disconnected'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
