import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPVaultPage } from '@/components/ip-vault/IPVaultPage';
import { ipVaultService } from '@/services/ipVaultService';
import type { IPVaultItem } from '@/types/ip-vault';

vi.mock('@/components/ip-vault/IPVaultVoiceBridge', () => ({
  IPVaultVoiceBridge: () => null,
}));

vi.mock('@/services/ipVaultService', () => ({
  ipVaultService: {
    list: vi.fn(),
    updateRights: vi.fn(),
    pinStoryMetadata: vi.fn(),
    markRegistering: vi.fn(),
    markRegistrationFailed: vi.fn(),
    persistRegistration: vi.fn(),
  },
}));

vi.mock('@/hooks/useStoryProtocolClient', () => ({
  useStoryProtocolClient: () => ({
    isConnected: false,
    isOnAeneid: false,
    isSwitching: false,
    address: null,
    switchToAeneid: vi.fn(),
    createStoryClient: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const item: IPVaultItem = {
  id: 'vault-1',
  user_id: 'user-1',
  project_id: 'project-1',
  source_type: 'character_blueprint',
  source_id: 'blueprint-1',
  asset_kind: 'character',
  title: 'Nova Pilot',
  description: 'Hero character.',
  media_url: 'https://cdn.example.com/nova.png',
  thumbnail_url: 'https://cdn.example.com/nova-thumb.png',
  media_type: 'image/png',
  metadata: {},
  story_network: 'aeneid',
  registration_status: 'draft',
  ip_id: null,
  token_id: null,
  nft_contract: null,
  tx_hash: null,
  story_explorer_url: null,
  ip_metadata_uri: null,
  ip_metadata_hash: null,
  nft_metadata_uri: null,
  nft_metadata_hash: null,
  media_hash: null,
  license_profile: 'none',
  license_terms_ids: [],
  parent_ip_ids: [],
  relationship_type: 'root',
  royalty_policy: null,
  commercial_rev_share: null,
  minting_fee_wip: null,
  proof_packet: {},
  created_at: '2026-05-04T14:00:00.000Z',
  updated_at: '2026-05-04T14:00:00.000Z',
};

describe('IPVaultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty finalized IP gallery state', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([]);

    render(<IPVaultPage />);

    expect(await screen.findByText('No finalized IP yet')).toBeInTheDocument();
    expect(screen.getByText('0 finalized')).toBeInTheDocument();
  });

  it('renders finalized items and blocks registration until a wallet is connected', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([item]);

    render(<IPVaultPage />);

    expect(await screen.findAllByText('Nova Pilot')).toHaveLength(2);
    expect(screen.getByText('Required')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ip-vault-register-button'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Connect a wallet before registering IP.'));
  });
});
