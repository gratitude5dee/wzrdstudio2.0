import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import KanvasPage from "@/pages/KanvasPage";
import type { KanvasModel } from "@/features/kanvas/types";
import { useUserTier } from "@/hooks/useUserTier";

const baseModels: Record<string, KanvasModel[]> = {
  image: [
    {
      id: "gmi/seedream-5.0-lite",
      name: "Seedream 5 Lite",
      description: "Free image model",
      studio: "image",
      mode: "text-to-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 0,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/nano-banana-pro",
      name: "Nano Banana Pro",
      description: "Image model",
      studio: "image",
      mode: "text-to-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 7,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/nano-banana-pro/edit",
      name: "Nano Banana Edit",
      description: "Edit model",
      studio: "image",
      mode: "image-to-image",
      mediaType: "image",
      workflowType: "image-edit",
      uiGroup: "advanced",
      credits: 8,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
  video: [
    {
      id: "gmi/kling-v3-omni",
      name: "Kling V3 Omni",
      description: "Free video model",
      studio: "video",
      mode: "text-to-video",
      mediaType: "video",
      workflowType: "text-to-video",
      uiGroup: "generation",
      credits: 0,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/sora-2/text-to-video",
      name: "Sora 2",
      description: "Video model",
      studio: "video",
      mode: "text-to-video",
      mediaType: "video",
      workflowType: "text-to-video",
      uiGroup: "generation",
      credits: 35,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "gmi/ltx-fast-i2v",
      name: "LTX Fast I2V",
      description: "Free image to video model",
      studio: "video",
      mode: "image-to-video",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "generation",
      credits: 0,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/kling-video/o3/standard/image-to-video",
      name: "Kling I2V",
      description: "Image to video model",
      studio: "video",
      mode: "image-to-video",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "generation",
      credits: 24,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
  cinema: [
    {
      id: "gmi/seedream-5.0-lite",
      name: "Seedream 5 Lite Cinema",
      description: "Free cinema model",
      studio: "cinema",
      mode: "cinematic-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 0,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/nano-banana-pro",
      name: "Nano Banana Cinema",
      description: "Cinema model",
      studio: "cinema",
      mode: "cinematic-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 7,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
  lipsync: [
    {
      id: "gmi/ltx-pro-a2v",
      name: "LTX Pro Audio to Video",
      description: "Free talking head",
      studio: "lipsync",
      mode: "talking-head",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "advanced",
      credits: 0,
      requiresAssets: ["image", "audio"],
      supportsPrompt: false,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "veed/fabric-1.0",
      name: "VEED Fabric 1.0",
      description: "Talking head",
      studio: "lipsync",
      mode: "talking-head",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "advanced",
      credits: 20,
      requiresAssets: ["image", "audio"],
      supportsPrompt: false,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/sync-lipsync/v2",
      name: "Sync Lipsync 2.0",
      description: "Video lip sync",
      studio: "lipsync",
      mode: "lip-sync",
      mediaType: "video",
      workflowType: "video-to-video",
      uiGroup: "advanced",
      credits: 20,
      requiresAssets: ["video", "audio"],
      supportsPrompt: false,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
};

vi.mock("@/features/kanvas/service", () => ({
  fetchKanvasModels: vi.fn(async (studio: keyof typeof baseModels) => baseModels[studio] ?? []),
  listKanvasAssets: vi.fn(async () => []),
  listKanvasJobs: vi.fn(async () => []),
  refreshKanvasJobStatus: vi.fn(async () => {
    throw new Error("not used");
  }),
  submitKanvasJob: vi.fn(async () => {
    throw new Error("not used");
  }),
  uploadKanvasAsset: vi.fn(async () => {
    throw new Error("not used");
  }),
}));

vi.mock("@/hooks/useUserTier", () => ({
  useUserTier: vi.fn(() => ({
    tier: "free",
    isFree: true,
    isPaid: false,
    defaultProvider: "gmi-cloud",
    isLoading: false,
  })),
  sortModelsForTier: (models: KanvasModel[], tier: "free" | "pro" | "enterprise") =>
    tier === "free"
      ? [...models].sort((left, right) => Number(!left.id.startsWith("gmi/")) - Number(!right.id.startsWith("gmi/")))
      : models,
}));

const mockedUseUserTier = vi.mocked(useUserTier);

function renderPage(initialEntry = "/kanvas") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/kanvas" element={<KanvasPage />} />
        <Route path="/home" element={<div>Home Destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("KanvasPage", () => {
  beforeEach(() => {
    mockedUseUserTier.mockReturnValue({
      tier: "free",
      isFree: true,
      isPaid: false,
      defaultProvider: "gmi-cloud",
      isLoading: false,
    });
  });

  it("renders the multi-studio shell and defaults to image", async () => {
    renderPage("/kanvas");

    expect(screen.getAllByRole("button", { name: "Home" })[0]).toBeInTheDocument();
    expect(
      await screen.findByText(/TURN IDEAS/i)
    ).toBeInTheDocument();
  });

  it("defaults free users to the GMI image model", async () => {
    renderPage("/kanvas");

    await waitFor(() => {
      expect(screen.getAllByText("Seedream 5 Lite")[0]).toBeInTheDocument();
    });
  });

  it("keeps paid users on the GMI image default unless they switch", async () => {
    mockedUseUserTier.mockReturnValue({
      tier: "pro",
      isFree: false,
      isPaid: true,
      defaultProvider: "fal-ai",
      isLoading: false,
    });

    renderPage("/kanvas");

    await waitFor(() => {
      expect(screen.getAllByText("Nano Banana Pro")[0]).toBeInTheDocument();
    });
  });

  it("defaults free users to the GMI video model on the video studio route", async () => {
    renderPage("/kanvas?studio=video");

    expect(
      await screen.findByRole("button", { name: /create video/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Kling V3 Omni")[0]).toBeInTheDocument();
    });
  });

  it("respects the studio query param and switches studios from the shell nav", async () => {
    renderPage("/kanvas?studio=video");

    expect(
      await screen.findByRole("button", { name: /create video/i })
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /lip sync/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /talking head/i })).toBeInTheDocument();
    });
  });
});
