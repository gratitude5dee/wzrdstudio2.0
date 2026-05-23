import { useMemo } from 'react';

import { ipVaultService } from '@/services/ipVaultService';
import type { IPVaultItem, IPVaultLicenseProfile, IPVaultRelationshipType, IPVaultSourceType } from '@/types/ip-vault';
import { useRegisterVoiceActions } from '@/voice/VoiceAgentProvider';
import type { VoiceActionRegistration, VoiceActionResult } from '@/voice/actions/registry';

interface IPVaultVoiceBridgeProps {
  items: IPVaultItem[];
  selectedItem: IPVaultItem | null;
  onSelectItem: (itemId: string) => void;
  onRefresh: () => Promise<void>;
  onUpdateRights: (patch: {
    licenseProfile?: IPVaultLicenseProfile;
    relationshipType?: IPVaultRelationshipType;
    parentIpIds?: string[];
    licenseTermsIds?: string[];
  }) => Promise<void>;
  onRegister: (item: IPVaultItem) => Promise<void>;
  onClaimRevenue: (item: IPVaultItem) => Promise<void>;
}

function completed(message: string, data?: unknown): VoiceActionResult {
  return { ok: true, status: 'completed', message, data };
}

function invalid(message: string): VoiceActionResult {
  return { ok: false, status: 'invalid_input', message, errorCode: 'ip_vault_invalid_input' };
}

function findItem(items: IPVaultItem[], input: unknown, selectedItem: IPVaultItem | null): IPVaultItem | null {
  const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const itemId = typeof payload.itemId === 'string' ? payload.itemId : null;
  const title = typeof payload.title === 'string' ? payload.title.toLowerCase() : null;
  if (itemId) return items.find((item) => item.id === itemId) ?? null;
  if (title) return items.find((item) => item.title.toLowerCase().includes(title)) ?? null;
  return selectedItem;
}

export function IPVaultVoiceBridge({
  items,
  selectedItem,
  onSelectItem,
  onRefresh,
  onUpdateRights,
  onRegister,
  onClaimRevenue,
}: IPVaultVoiceBridgeProps) {
  const registrations = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: 'ip_vault_select_item',
        scope: 'ip-vault',
        handler: (input) => {
          const item = findItem(items, input, selectedItem);
          if (!item) return invalid('I could not find that IP Vault item.');
          onSelectItem(item.id);
          return completed(`Selected ${item.title}.`, { itemId: item.id });
        },
      },
      {
        name: 'ip_vault_set_license',
        scope: 'ip-vault',
        confirmation: {
          risk: 'sensitive',
          message: 'Confirm license changes for this IP Vault item?',
        },
        handler: async (input) => {
          const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
          const licenseProfile = payload.licenseProfile;
          if (
            licenseProfile !== 'none' &&
            licenseProfile !== 'non_commercial_social_remix' &&
            licenseProfile !== 'commercial_use' &&
            licenseProfile !== 'commercial_remix' &&
            licenseProfile !== 'creative_commons_attribution'
          ) {
            return invalid('I need a valid Story license profile.');
          }
          await onUpdateRights({ licenseProfile });
          return completed(`Set license to ${licenseProfile.replace(/_/g, ' ')}.`);
        },
      },
      {
        name: 'ip_vault_set_derivative',
        scope: 'ip-vault',
        confirmation: {
          risk: 'sensitive',
          message: 'Confirm derivative relationship changes for this IP Vault item?',
        },
        handler: async (input) => {
          const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
          const relationshipType =
            payload.relationshipType === 'remix' ||
            payload.relationshipType === 'adaptation' ||
            payload.relationshipType === 'derivative'
              ? payload.relationshipType
              : 'derivative';
          const parentIpId = typeof payload.parentIpId === 'string' ? payload.parentIpId : null;
          const licenseTermsId = typeof payload.licenseTermsId === 'string' ? payload.licenseTermsId : '1';
          await onUpdateRights({
            relationshipType,
            parentIpIds: parentIpId ? [parentIpId] : undefined,
            licenseTermsIds: parentIpId ? [licenseTermsId] : undefined,
          });
          return completed('Updated derivative settings.');
        },
      },
      {
        name: 'ip_vault_finalize_asset',
        scope: 'ip-vault',
        confirmation: {
          risk: 'write',
          message: 'Confirm finalizing this asset into IP Vault?',
        },
        handler: async (input) => {
          const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
          const sourceType = payload.sourceType as IPVaultSourceType | undefined;
          const sourceId = typeof payload.sourceId === 'string' ? payload.sourceId : null;
          if (!sourceType || !sourceId) {
            return invalid('I need the source type and source ID before finalizing an asset.');
          }
          const item = await ipVaultService.finalizeSource({
            sourceType,
            sourceId,
            title: typeof payload.title === 'string' ? payload.title : undefined,
            assetKind: typeof payload.assetKind === 'string' ? payload.assetKind : undefined,
          });
          await onRefresh();
          onSelectItem(item.id);
          return completed(`${item.title} is finalized in IP Vault.`, { itemId: item.id });
        },
      },
      {
        name: 'ip_vault_register_ip',
        scope: 'ip-vault',
        confirmation: {
          risk: 'sensitive',
          message: 'Confirm wallet transaction to register this IP on Story?',
        },
        handler: async (input) => {
          const item = findItem(items, input, selectedItem);
          if (!item) return invalid('Select an IP Vault item before registering it.');
          await onRegister(item);
          return completed(`Started Story registration for ${item.title}.`, { itemId: item.id });
        },
      },
      {
        name: 'ip_vault_claim_revenue',
        scope: 'ip-vault',
        confirmation: {
          risk: 'sensitive',
          message: 'Confirm claiming Story revenue for this IP?',
        },
        handler: async (input) => {
          const item = findItem(items, input, selectedItem);
          if (!item) return invalid('Select a registered IP before claiming revenue.');
          await onClaimRevenue(item);
          return completed(`Started revenue claim for ${item.title}.`, { itemId: item.id });
        },
      },
    ],
    [items, onClaimRevenue, onRefresh, onRegister, onSelectItem, onUpdateRights, selectedItem],
  );

  useRegisterVoiceActions(registrations);
  return null;
}
