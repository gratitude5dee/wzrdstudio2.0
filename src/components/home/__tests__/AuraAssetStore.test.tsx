import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuraAssetStore } from '@/components/home/AuraAssetStore';
import { useCharacterCreationStore } from '@/lib/stores/character-creation-store';
import { assetService } from '@/services/assetService';
import { createBlueprint, listBlueprints, toggleBlueprintPinned } from '@/services/characterBlueprintService';
import type { ProjectAsset } from '@/types/assets';
import type { CharacterBlueprint } from '@/types/character-creation';

vi.mock('@/services/assetService', () => ({
  assetService: {
    list: vi.fn(),
  },
}));

vi.mock('@/services/characterBlueprintService', () => ({
  createBlueprint: vi.fn(),
  incrementBlueprintUsage: vi.fn(() => Promise.resolve()),
  listBlueprints: vi.fn(),
  toggleBlueprintPinned: vi.fn(),
}));

const legacyAsset: ProjectAsset = {
  id: 'asset-1',
  user_id: 'user-1',
  project_id: null,
  file_name: 'legacy-reference.png',
  original_file_name: 'legacy-reference.png',
  mime_type: 'image/png',
  file_size_bytes: 2048,
  asset_type: 'image',
  asset_category: 'upload',
  storage_provider: 'supabase',
  storage_bucket: 'project-assets',
  storage_path: 'legacy-reference.png',
  cdn_url: 'https://cdn.example.com/legacy-reference.png',
  media_metadata: {},
  processing_status: 'completed',
  processing_error: null,
  thumbnail_bucket: null,
  thumbnail_path: null,
  thumbnail_url: 'https://cdn.example.com/legacy-reference-thumb.png',
  preview_bucket: null,
  preview_path: null,
  preview_url: null,
  used_in_pages: [],
  usage_count: 0,
  visibility: 'private',
  is_archived: false,
  created_at: '2026-05-04T08:00:00.000Z',
  updated_at: '2026-05-04T08:00:00.000Z',
  last_accessed_at: null,
};

function blueprint(overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    id: 'blueprint-1',
    userId: 'user-1',
    projectId: null,
    name: 'Nova Pilot',
    slug: 'nova-pilot',
    kind: 'character',
    traits: {},
    faceDetails: {},
    bodyDetails: {},
    styleDetails: {},
    promptFragment: 'CHARACTER ANCHOR: Nova Pilot',
    imageUrl: null,
    thumbnailUrl: null,
    referenceAssetIds: ['asset-1'],
    referenceImageUrls: ['https://cdn.example.com/legacy-reference-thumb.png'],
    isFavorite: false,
    usageCount: 0,
    createdAt: '2026-05-04T08:00:00.000Z',
    updatedAt: '2026-05-04T08:00:00.000Z',
    ...overrides,
  };
}

function renderStore() {
  return render(
    <MemoryRouter>
      <AuraAssetStore projects={[]} />
    </MemoryRouter>,
  );
}

describe('AuraAssetStore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useCharacterCreationStore.getState().reset();
    vi.mocked(assetService.list).mockResolvedValue([legacyAsset]);
    vi.mocked(listBlueprints).mockResolvedValue([]);
    vi.mocked(createBlueprint).mockResolvedValue(blueprint());
    vi.mocked(toggleBlueprintPinned).mockImplementation((id: string, pinned: boolean) =>
      Promise.resolve(blueprint({ id, isFavorite: pinned })),
    );
  });

  it('loads legacy-safe asset rows without rendering the failed load message', async () => {
    renderStore();

    expect(await screen.findByText('legacy-reference.png')).toBeInTheDocument();
    expect(screen.queryByText(/failed to load assets/i)).not.toBeInTheDocument();
  });

  it('creates a blueprint from a selected reference without starting generation', async () => {
    renderStore();

    fireEvent.click(await screen.findByText('legacy-reference.png'));
    fireEvent.change(screen.getByPlaceholderText('Name, e.g. Nova Pilot'), {
      target: { value: 'Nova Pilot' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save blueprint/i }));

    await waitFor(() => expect(createBlueprint).toHaveBeenCalledTimes(1));
    expect(createBlueprint).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Nova Pilot',
      kind: 'character',
      referenceImages: [expect.objectContaining({ assetId: 'asset-1' })],
    }));
  });

  it('renders a quiet schema diagnostic instead of the generic red error', async () => {
    vi.mocked(assetService.list).mockRejectedValue(new Error('column project_assets.asset_type does not exist'));

    renderStore();

    expect(await screen.findByText('Asset library schema mismatch')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load assets.')).not.toBeInTheDocument();
  });
});
