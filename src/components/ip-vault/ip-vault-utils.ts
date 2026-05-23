import { ipfsUriToGatewayUrl } from '@/lib/story/constants';
import type { IPVaultItem, IPVaultLicenseProfile, IPVaultRegistrationStatus } from '@/types/ip-vault';

export type StatusFilter = 'all' | IPVaultRegistrationStatus;

export const LICENSE_LABELS: Record<IPVaultLicenseProfile, string> = {
  none: 'No public license',
  non_commercial_social_remix: 'Non-commercial remix',
  commercial_use: 'Commercial use',
  commercial_remix: 'Commercial remix',
  creative_commons_attribution: 'CC BY',
};

export const LICENSE_DESCRIPTIONS: Record<IPVaultLicenseProfile, string> = {
  none: 'Private/controlled rights — no public license attached',
  non_commercial_social_remix: 'Story licenseTermsId 1 — non-commercial social remixing allowed',
  commercial_use: 'Paid commercial use, no derivative works',
  commercial_remix: 'Commercial use plus derivatives with revenue share',
  creative_commons_attribution: 'Attribution-friendly public licensing',
};

export const STATUS_LABELS: Record<IPVaultRegistrationStatus, string> = {
  draft: 'Draft',
  metadata_ready: 'Metadata ready',
  registering: 'Registering',
  registered: 'Registered',
  failed: 'Failed',
};

export function previewUrl(item: IPVaultItem): string | null {
  return ipfsUriToGatewayUrl(item.thumbnail_url) ?? ipfsUriToGatewayUrl(item.media_url);
}

export function statusClass(status: IPVaultRegistrationStatus) {
  if (status === 'registered') return 'border-lime-300/30 bg-lime-300/10 text-lime-200';
  if (status === 'failed') return 'border-red-400/30 bg-red-400/10 text-red-200';
  if (status === 'metadata_ready') return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200';
  if (status === 'registering') return 'border-orange-300/30 bg-orange-300/10 text-orange-200';
  return 'border-white/10 bg-white/[0.04] text-zinc-300';
}

export function formatIp(id: string | null): string {
  if (!id) return '—';
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function formatHash(hash: string | null): string {
  if (!hash) return '—';
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
