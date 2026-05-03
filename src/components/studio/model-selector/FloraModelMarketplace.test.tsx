import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useCatalogModels', () => ({
  useCatalogModels: () => ({
    models: [
      {
        id: 'gmi/deepseek-r1',
        name: 'DeepSeek R1',
        description: 'Reasoning model',
        category: 'text-generation',
        media_type: 'text',
        workflow_type: 'chat-completion',
        ui_group: 'generation',
        supports: ['prompt'],
        defaults: {},
        controls: [],
        aliases: [],
        provider: 'gmi-cloud',
        credits: 0,
        time: '~4s',
      },
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast general model',
        category: 'text-generation',
        media_type: 'text',
        workflow_type: 'chat-completion',
        ui_group: 'generation',
        supports: ['prompt'],
        defaults: {},
        controls: [],
        aliases: [],
        provider: 'google',
        credits: 2,
        time: '~3s',
      },
      {
        id: 'openai/gpt-5-mini',
        name: 'GPT-5 Mini',
        description: 'Compact OpenAI model',
        category: 'text-generation',
        media_type: 'text',
        workflow_type: 'chat-completion',
        ui_group: 'generation',
        supports: ['prompt'],
        defaults: {},
        controls: [],
        aliases: [],
        provider: 'openai',
        credits: 3,
        time: '~3s',
      },
    ],
  }),
}));

import {
  FloraModelMarketplace,
  type FloraModelMarketplaceValue,
} from './FloraModelMarketplace';

describe('FloraModelMarketplace', () => {
  it('renders a two-panel provider flyout and switches providers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value: FloraModelMarketplaceValue = {
      auto: false,
      selectedModelIds: ['google/gemini-2.5-flash'],
      useMultipleModels: false,
    };

    render(
      <FloraModelMarketplace
        mediaType="text"
        value={value}
        onChange={onChange}
        triggerVariant="toolbar"
      />
    );

    await user.click(screen.getByRole('button', { name: /gemini 2\.5 flash/i }));

    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /google 1 model/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: /openai 1 model/i }));
    await waitFor(() => {
      expect(screen.getByText('GPT-5 Mini')).toBeInTheDocument();
    });
  });
});
