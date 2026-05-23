import { Check } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROYALTY_POLICY_LAP_ADDRESS, ROYALTY_POLICY_LRP_ADDRESS } from '@/lib/story/constants';
import { cn } from '@/lib/utils';
import type { IPVaultItem, IPVaultLicenseProfile } from '@/types/ip-vault';
import { LICENSE_DESCRIPTIONS, LICENSE_LABELS } from '../ip-vault-utils';

interface Props {
  item: IPVaultItem;
  onUpdateRights: (patch: {
    licenseProfile?: IPVaultLicenseProfile;
    commercialRevShare?: number | null;
    mintingFeeWip?: number | null;
  }) => void;
}

const PROFILES: IPVaultLicenseProfile[] = [
  'none',
  'non_commercial_social_remix',
  'commercial_use',
  'commercial_remix',
  'creative_commons_attribution',
];

export function IPVaultLicensingTab({ item, onUpdateRights }: Props) {
  const isRegistered = item.registration_status === 'registered';
  const isCommercial = item.license_profile === 'commercial_use' || item.license_profile === 'commercial_remix';

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">License profile</p>

      {isRegistered && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-500">
          License profile is locked after registration. Changing terms requires a new onchain action.
        </div>
      )}

      <div className="space-y-2">
        {PROFILES.map((profile) => {
          const selected = item.license_profile === profile;
          return (
            <button
              key={profile}
              type="button"
              disabled={isRegistered}
              onClick={() => onUpdateRights({ licenseProfile: profile })}
              className={cn(
                'w-full rounded-xl border px-3 py-2.5 text-left transition-all',
                selected
                  ? 'border-orange-300/40 bg-orange-300/10'
                  : 'border-white/[0.06] bg-black/20 hover:border-white/[0.12]',
                isRegistered && !selected && 'cursor-not-allowed opacity-40',
              )}
              data-testid={`license-card-${profile}`}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-sm font-medium', selected ? 'text-orange-200' : 'text-zinc-300')}>
                  {LICENSE_LABELS[profile]}
                </span>
                {selected && <Check className="h-4 w-4 text-orange-300" />}
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">{LICENSE_DESCRIPTIONS[profile]}</p>
            </button>
          );
        })}
      </div>

      {isCommercial && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-[10px] text-zinc-500">Minting fee (WIP)</Label>
              <Input
                value={item.minting_fee_wip ?? 0}
                type="number"
                min="0"
                step="0.01"
                disabled={isRegistered}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 0) onUpdateRights({ mintingFeeWip: val });
                }}
                className="rounded-xl border-white/10 bg-black/40 text-white"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] text-zinc-500">Rev share %</Label>
              <Input
                value={item.commercial_rev_share ?? 5}
                type="number"
                min="0"
                max="100"
                step="0.5"
                disabled={isRegistered || item.license_profile !== 'commercial_remix'}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 0 && val <= 100) onUpdateRights({ commercialRevShare: val });
                }}
                className="rounded-xl border-white/10 bg-black/40 text-white"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[10px] text-zinc-500">Royalty policy</Label>
            <Select
              value={item.royalty_policy ?? ROYALTY_POLICY_LAP_ADDRESS}
              disabled={isRegistered}
              onValueChange={() => {
                /* royalty_policy is set through updateRights with full patch in parent */
              }}
            >
              <SelectTrigger className="rounded-xl border-white/10 bg-black/40 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROYALTY_POLICY_LAP_ADDRESS}>LAP (Liquid Absolute)</SelectItem>
                <SelectItem value={ROYALTY_POLICY_LRP_ADDRESS}>LRP (Liquid Relative)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}
