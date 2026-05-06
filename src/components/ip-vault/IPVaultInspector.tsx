import { useState } from 'react';

import { cn } from '@/lib/utils';
import type { IPVaultItem, IPVaultLicenseProfile, IPVaultRelationshipType } from '@/types/ip-vault';
import type { StoryWalletState } from '@/hooks/useStoryProtocolClient';

import { IPVaultOverviewTab } from './tabs/IPVaultOverviewTab';
import { IPVaultRegistrationTab } from './tabs/IPVaultRegistrationTab';
import { IPVaultLicensingTab } from './tabs/IPVaultLicensingTab';
import { IPVaultDerivativesTab } from './tabs/IPVaultDerivativesTab';
import { IPVaultRoyaltiesTab } from './tabs/IPVaultRoyaltiesTab';
import { IPVaultProofTab } from './tabs/IPVaultProofTab';

type InspectorTab = 'overview' | 'registration' | 'licensing' | 'derivatives' | 'royalties' | 'proof';

const TABS: { key: InspectorTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'registration', label: 'Register' },
  { key: 'licensing', label: 'License' },
  { key: 'derivatives', label: 'Derive' },
  { key: 'royalties', label: 'Royalty' },
  { key: 'proof', label: 'Proof' },
];

interface IPVaultInspectorProps {
  item: IPVaultItem | null;
  wallet: StoryWalletState;
  registeredParents: IPVaultItem[];
  actionLoading: string | null;
  onPrepareMetadata: () => void;
  onRegister: () => void;
  onClaimRevenue: () => void;
  onUpdateRights: (patch: {
    licenseProfile?: IPVaultLicenseProfile;
    relationshipType?: IPVaultRelationshipType;
    parentIpIds?: string[];
    licenseTermsIds?: string[];
    commercialRevShare?: number | null;
    mintingFeeWip?: number | null;
  }) => void;
}

export function IPVaultInspector({
  item,
  wallet,
  registeredParents,
  actionLoading,
  onPrepareMetadata,
  onRegister,
  onClaimRevenue,
  onUpdateRights,
}: IPVaultInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('overview');

  if (!item) {
    return (
      <aside className="h-fit rounded-3xl border border-white/[0.08] bg-[#0d0d12]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="py-12 text-center text-sm text-zinc-500">Select a vault item.</div>
      </aside>
    );
  }

  return (
    <aside className="h-fit rounded-3xl border border-white/[0.08] bg-[#0d0d12]/95 shadow-[0_24px_80px_rgba(0,0,0,0.28)]" data-testid="ip-vault-detail">
      {/* Pill-Slider tabs */}
      <div className="border-b border-white/[0.06] p-2">
        <div className="flex items-center gap-0.5 rounded-xl bg-black/40 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all',
                tab === t.key
                  ? 'bg-orange-400/15 text-orange-200 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
              data-testid={`inspector-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100vh-280px)] overflow-y-auto p-4">
        {tab === 'overview' && <IPVaultOverviewTab item={item} />}
        {tab === 'registration' && (
          <IPVaultRegistrationTab
            item={item}
            wallet={wallet}
            actionLoading={actionLoading}
            onPrepareMetadata={onPrepareMetadata}
            onRegister={onRegister}
          />
        )}
        {tab === 'licensing' && (
          <IPVaultLicensingTab item={item} onUpdateRights={onUpdateRights} />
        )}
        {tab === 'derivatives' && (
          <IPVaultDerivativesTab
            item={item}
            registeredParents={registeredParents}
            onUpdateRights={onUpdateRights}
          />
        )}
        {tab === 'royalties' && (
          <IPVaultRoyaltiesTab
            item={item}
            actionLoading={actionLoading}
            onClaimRevenue={onClaimRevenue}
          />
        )}
        {tab === 'proof' && <IPVaultProofTab item={item} />}
      </div>
    </aside>
  );
}
