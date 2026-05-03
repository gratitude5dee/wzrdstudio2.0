import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useSmartBlockSuggestions', () => ({
  useSmartBlockSuggestions: () => [],
}));

import { ConnectionNodeSelector } from './ConnectionNodeSelector';

describe('ConnectionNodeSelector', () => {
  it('offers legacy node types and registry actions', async () => {
    const user = userEvent.setup();
    const onSelectType = vi.fn();
    const onSelectAction = vi.fn();

    render(
      <ConnectionNodeSelector
        position={{ x: 0, y: 0 }}
        onSelectType={onSelectType}
        onSelectAction={onSelectAction}
        onNavigate={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /layer editor/i }));
    expect(onSelectType).toHaveBeenCalledWith('imageEdit');

    await user.click(screen.getByRole('button', { name: /batch x batch/i }));
    expect(onSelectAction).toHaveBeenCalledWith('batch.cartesian');
    expect(onSelectType).toHaveBeenCalledTimes(1);
  });
});
