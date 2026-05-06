import { AlertTriangle } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IPVaultItem, IPVaultRelationshipType } from '@/types/ip-vault';
import { formatIp } from '../ip-vault-utils';

interface Props {
  item: IPVaultItem;
  registeredParents: IPVaultItem[];
  onUpdateRights: (patch: {
    relationshipType?: IPVaultRelationshipType;
    parentIpIds?: string[];
    licenseTermsIds?: string[];
  }) => void;
}

export function IPVaultDerivativesTab({ item, registeredParents, onUpdateRights }: Props) {
  const isRegistered = item.registration_status === 'registered';
  const isDerivative = item.relationship_type !== 'root';
  const missingParent = isDerivative && item.parent_ip_ids.length === 0;

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Relationship type</p>

      {isRegistered && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-500">
          Derivative relationship is locked after registration.
        </div>
      )}

      <Select
        value={item.relationship_type}
        disabled={isRegistered}
        onValueChange={(v) => onUpdateRights({ relationshipType: v as IPVaultRelationshipType })}
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

      {isDerivative && (
        <>
          <div className="grid gap-1.5">
            <p className="text-[10px] font-medium text-zinc-500">Parent IP</p>
            <Select
              value={item.parent_ip_ids[0] ?? ''}
              disabled={isRegistered}
              onValueChange={(value) => {
                const parent = registeredParents.find((p) => p.ip_id === value);
                onUpdateRights({
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
                    <span className="flex items-center gap-2">
                      <span>{parent.title}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{formatIp(parent.ip_id)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {item.parent_ip_ids.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-zinc-400">
              <p>Parent: <span className="font-mono text-zinc-300">{formatIp(item.parent_ip_ids[0])}</span></p>
              <p>License terms: <span className="font-mono text-zinc-300">{item.license_terms_ids[0] ?? '—'}</span></p>
            </div>
          )}

          {missingParent && (
            <div className="flex items-start gap-2 rounded-xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Derivative registration requires a registered parent IP. Select one above or change to Root IP.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
