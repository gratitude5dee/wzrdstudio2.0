import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MentionDropdown } from '@/components/character-creation/MentionDropdown';
import type { CharacterMention } from '@/types/character-creation';

function mention(overrides: Partial<CharacterMention>): CharacterMention {
  return {
    id: 'mention-1',
    name: 'Nova Pilot',
    slug: 'nova-pilot',
    imageUrl: null,
    promptFragment: 'anchor',
    kind: 'character',
    isPinned: false,
    usageCount: 0,
    updatedAt: '2026-05-04T08:00:00.000Z',
    referenceAssetIds: [],
    referenceImageUrls: [],
    ...overrides,
  };
}

describe('MentionDropdown', () => {
  it('renders grouped character, object, and location suggestions', () => {
    render(
      <MentionDropdown
        visible
        suggestions={[
          mention({ id: 'character-1', name: 'Nova Pilot', slug: 'nova-pilot', kind: 'character' }),
          mention({ id: 'object-1', name: 'Crystal Key', slug: 'crystal-key', kind: 'object' }),
          mention({ id: 'location-1', name: 'Neon Bazaar', slug: 'neon-bazaar', kind: 'location' }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Characters')).toBeInTheDocument();
    expect(screen.getByText('Objects')).toBeInTheDocument();
    expect(screen.getByText('Locations')).toBeInTheDocument();
    expect(screen.getByText('Nova Pilot')).toBeInTheDocument();
    expect(screen.getByText('Crystal Key')).toBeInTheDocument();
    expect(screen.getByText('Neon Bazaar')).toBeInTheDocument();
  });

  it('pins without selecting the mention row', () => {
    const onSelect = vi.fn();
    const onTogglePin = vi.fn();

    render(
      <MentionDropdown
        visible
        suggestions={[mention({ id: 'object-1', name: 'Crystal Key', slug: 'crystal-key', kind: 'object' })]}
        onSelect={onSelect}
        onTogglePin={onTogglePin}
      />,
    );

    fireEvent.click(screen.getByLabelText('Pin Crystal Key'));

    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
