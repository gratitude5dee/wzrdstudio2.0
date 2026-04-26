import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useSmartBlockSuggestions', () => ({
  useSmartBlockSuggestions: () => [],
}));

import { ConnectionNodeSelector } from './ConnectionNodeSelector';

describe('ConnectionNodeSelector', () => {
  it('offers Layer Editor and keeps Batch disabled', async () => {
    const user = userEvent.setup();
    const onSelectType = vi.fn();

    render(
      <ConnectionNodeSelector
        position={{ x: 0, y: 0 }}
        onSelectType={onSelectType}
        onNavigate={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /layer editor/i }));
    expect(onSelectType).toHaveBeenCalledWith('imageEdit');

    expect(screen.getByText('Batch')).toBeInTheDocument();
    expect(onSelectType).toHaveBeenCalledTimes(1);
  });
});
