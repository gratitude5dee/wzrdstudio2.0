import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const catalogHook = vi.hoisted(() => vi.fn());
const modelLookupInvoke = vi.hoisted(() => vi.fn());

const baseModels = [
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
  {
    id: 'fal-ai/nano-banana-2',
    name: 'Nano Banana 2',
    description: 'Image generation model',
    category: 'text-to-image',
    media_type: 'image',
    workflow_type: 'text-to-image',
    ui_group: 'generation',
    supports: ['prompt'],
    defaults: {},
    controls: [],
    aliases: ['nano-banana'],
    provider: 'fal-ai',
    provider_label: 'fal.ai',
    endpoint_id: 'fal-ai/nano-banana-2',
    credits: 5,
    time: '~30s',
  },
];

const advancedSearchModels = [
  {
    id: 'fal-ai/nano-banana-2/edit',
    name: 'Nano Banana 2 Edit',
    description: 'Image editing model',
    category: 'image-to-image',
    media_type: 'image',
    workflow_type: 'image-to-image',
    ui_group: 'advanced',
    supports: ['prompt', 'image_urls'],
    defaults: {},
    controls: [],
    aliases: ['nano-banana-edit'],
    provider: 'fal-ai',
    provider_label: 'fal.ai',
    endpoint_id: 'fal-ai/nano-banana-2/edit',
    credits: 7,
    time: '~30s',
  },
];

vi.mock('@/hooks/useCatalogModels', () => ({
  useCatalogModels: (options: Record<string, unknown>) => catalogHook(options),
  normalizeCatalogModelSummary: (model: unknown) => model,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: modelLookupInvoke,
    },
  },
}));

import {
  FloraModelMarketplace,
  type FloraModelMarketplaceValue,
} from './FloraModelMarketplace';

describe('FloraModelMarketplace', () => {
  beforeEach(() => {
    modelLookupInvoke.mockReset();
    catalogHook.mockImplementation((options: Record<string, unknown>) => ({
      models: options.search ? advancedSearchModels : baseModels,
      total: options.search ? 1 : baseModels.length,
      isLoading: false,
    }));
    modelLookupInvoke.mockResolvedValue({
      data: { model: baseModels.find((model) => model.id === 'fal-ai/nano-banana-2') },
      error: null,
    });
  });

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

  it('shows full-catalog controls in compact mode and sends server-backed search filters', async () => {
    const user = userEvent.setup();
    const value: FloraModelMarketplaceValue = {
      auto: false,
      selectedModelIds: ['fal-ai/nano-banana-2'],
      useMultipleModels: false,
    };

    render(
      <FloraModelMarketplace
        mediaType="image"
        value={value}
        onChange={vi.fn()}
        compact
        triggerVariant="toolbar"
        workflowTypes={['text-to-image', 'image-to-image']}
      />
    );

    await user.click(screen.getByRole('button', { name: /^nano banana 2$/i }));

    expect(screen.getByRole('button', { name: /recommended/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search models/i), 'nano banana edit');

    await waitFor(() => {
      expect(catalogHook).toHaveBeenLastCalledWith(expect.objectContaining({
        includeAdvanced: true,
        search: 'nano banana edit',
        uiGroup: undefined,
        workflowTypes: ['text-to-image', 'image-to-image'],
        limit: 250,
      }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('Nano Banana 2 Edit').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: /^nano banana 2$/i, expanded: true })).toBeInTheDocument();
  });

  it('looks up the selected model when it is outside the current result page', async () => {
    catalogHook.mockReturnValue({
      models: advancedSearchModels,
      total: advancedSearchModels.length,
      isLoading: false,
    });

    const value: FloraModelMarketplaceValue = {
      auto: false,
      selectedModelIds: ['fal-ai/nano-banana-2'],
      useMultipleModels: false,
    };

    render(
      <FloraModelMarketplace
        mediaType="image"
        value={value}
        onChange={vi.fn()}
        triggerVariant="toolbar"
      />
    );

    await waitFor(() => {
      expect(modelLookupInvoke).toHaveBeenCalledWith('model-catalog', {
        body: {
          id: 'fal-ai/nano-banana-2',
          studio_surface: 'studio:image',
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^nano banana 2$/i })).toBeInTheDocument();
    });
  });

  it('shows Fal catalog setup diagnostics when no Fal rows are returned', async () => {
    const user = userEvent.setup();
    catalogHook.mockReturnValue({
      models: [],
      total: 0,
      isLoading: false,
      diagnostics: {
        request: {
          provider: 'fal-ai',
          mediaType: 'image',
          uiGroup: 'generation',
          studioSurface: 'studio:image',
        },
        scanned: 0,
        providers: [],
        fal: {
          provider: 'fal-ai',
          providerLabel: 'Fal',
          total: 0,
          enabled: 0,
          visibleForRequest: 0,
          missingStudioSurface: 0,
          byMediaType: {},
          byUiGroup: {},
        },
      },
    });

    render(
      <FloraModelMarketplace
        mediaType="image"
        value={{ auto: false, selectedModelIds: [], useMultipleModels: false }}
        onChange={vi.fn()}
        provider="fal-ai"
        triggerVariant="toolbar"
      />
    );

    await user.click(screen.getByRole('button', { name: /select model/i }));

    expect(screen.getByText(/Fal catalog rows were not found/i)).toBeInTheDocument();
  });
});
