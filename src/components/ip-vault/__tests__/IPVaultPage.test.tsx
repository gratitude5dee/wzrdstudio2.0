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
    update: vi.fn(),
    pinStoryMetadata: vi.fn(),
    markRegistering: vi.fn(),
    markRegistrationFailed: vi.fn(),
    persistRegistration: vi.fn(),
  },
}));

const mockWallet = {
  isConnected: false,
  isOnAeneid: false,
  isSwitching: false,
  address: null,
  chainId: null,
  isOnMainnet: false,
  error: null,
  switchToAeneid: vi.fn(),
  createStoryClient: vi.fn(),
};

vi.mock('@/hooks/useStoryProtocolClient', () => ({
  useStoryProtocolClient: () => mockWallet,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function makeItem(overrides: Partial<IPVaultItem> = {}): IPVaultItem {
  return {
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
    royalty_vault_address: null,
    last_claim_tx_hash: null,
    last_claimed_at: null,
    created_at: '2026-05-04T14:00:00.000Z',
    updated_at: '2026-05-04T14:00:00.000Z',
    ...overrides,
  };
}

describe('IPVaultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWallet.isConnected = false;
    mockWallet.isOnAeneid = false;
    mockWallet.address = null;
  });

  it('renders the empty finalized IP gallery state', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([]);
    render(<IPVaultPage />);
    expect(await screen.findByText('No finalized IP yet')).toBeInTheDocument();
    expect(screen.getByText('0 finalized')).toBeInTheDocument();
  });

  it('renders summary metrics with correct counts', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([
      makeItem({ id: '1', registration_status: 'draft' }),
      makeItem({ id: '2', registration_status: 'metadata_ready' }),
      makeItem({ id: '3', registration_status: 'registered', ip_id: '0xabc' }),
      makeItem({ id: '4', registration_status: 'failed' }),
    ]);
    render(<IPVaultPage />);
    const summary = await screen.findByTestId('ip-vault-summary');
    expect(summary).toBeInTheDocument();
    // Total should be 4
    expect(screen.getByText('4')).toBeInTheDocument();
    // 1 registered
    expect(screen.getByText('1 registered')).toBeInTheDocument();
  });

  it('renders finalized items and blocks registration until wallet is connected', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([makeItem()]);
    render(<IPVaultPage />);
    expect(await screen.findAllByText('Nova Pilot')).toHaveLength(2);

    // Switch to registration tab
    fireEvent.click(screen.getByTestId('inspector-tab-registration'));
    fireEvent.click(screen.getByTestId('ip-vault-register-button'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Connect a wallet before registering IP.'));
  });

  it('shows metadata-ready item as pinned in registration tab', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([
      makeItem({ registration_status: 'metadata_ready', ip_metadata_uri: 'ipfs://test' }),
    ]);
    render(<IPVaultPage />);
    await screen.findByText('Nova Pilot');
    fireEvent.click(screen.getByTestId('inspector-tab-registration'));
    // Step 2 should be checked
    expect(screen.getByText('2. Metadata pinned to IPFS')).toBeInTheDocument();
  });

  it('shows StoryScan link for registered items in overview tab', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([
      makeItem({
        registration_status: 'registered',
        ip_id: '0xabc123',
        story_explorer_url: 'https://aeneid.storyscan.io/ipa/0xabc123',
        ip_metadata_uri: 'ipfs://meta',
      }),
    ]);
    render(<IPVaultPage />);
    await screen.findByText('Nova Pilot');
    // Overview tab is default
    expect(screen.getByText('View on StoryScan')).toBeInTheDocument();
    expect(screen.getByText('IP metadata (IPFS)')).toBeInTheDocument();
  });

  it('switches tabs in the inspector', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([makeItem()]);
    render(<IPVaultPage />);
    await screen.findByText('Nova Pilot');

    // Switch to licensing tab
    fireEvent.click(screen.getByTestId('inspector-tab-licensing'));
    expect(screen.getByText('License profile')).toBeInTheDocument();
    expect(screen.getByTestId('license-card-none')).toBeInTheDocument();

    // Switch to derivatives tab
    fireEvent.click(screen.getByTestId('inspector-tab-derivatives'));
    expect(screen.getByText('Relationship type')).toBeInTheDocument();

    // Switch to proof tab
    fireEvent.click(screen.getByTestId('inspector-tab-proof'));
    expect(screen.getByText('Source provenance')).toBeInTheDocument();
  });

  it('license profile card click calls updateRights', async () => {
    const item = makeItem();
    const updated = makeItem({ license_profile: 'commercial_remix' });
    vi.mocked(ipVaultService.list).mockResolvedValue([item]);
    vi.mocked(ipVaultService.updateRights).mockResolvedValue(updated);
    render(<IPVaultPage />);
    await screen.findByText('Nova Pilot');

    fireEvent.click(screen.getByTestId('inspector-tab-licensing'));
    fireEvent.click(screen.getByTestId('license-card-commercial_remix'));
    await waitFor(() => expect(ipVaultService.updateRights).toHaveBeenCalled());
  });

  it('shows royalty tab disabled message for unregistered items', async () => {
    vi.mocked(ipVaultService.list).mockResolvedValue([makeItem()]);
    render(<IPVaultPage />);
    await screen.findByText('Nova Pilot');
    fireEvent.click(screen.getByTestId('inspector-tab-royalties'));
    expect(screen.getByText(/Register this IP on Story/)).toBeInTheDocument();
  });

  it('shows derivative warning when derivative is selected but missing parent', async () => {
    const item = makeItem({ relationship_type: 'derivative', parent_ip_ids: [] });
    const updated = makeItem({ relationship_type: 'derivative', parent_ip_ids: [] });
    vi.mocked(ipVaultService.list).mockResolvedValue([item]);
    vi.mocked(ipVaultService.updateRights).mockResolvedValue(updated);
    render(<IPVaultPage />);
    await screen.findByText('Nova Pilot');
    fireEvent.click(screen.getByTestId('inspector-tab-derivatives'));
    expect(screen.getByText(/Derivative registration requires a registered parent IP/)).toBeInTheDocument();
  });
});
