import {
  refreshKanvasJob,
  submitKanvasJob,
  type KanvasAssetRecord,
  type KanvasCreditsAdapter,
  type KanvasFalAdapter,
  type KanvasGenerationRequest,
  type KanvasJobInsert,
  type KanvasJobRecord,
  type KanvasJobRepository,
  type KanvasJobUpdate,
  type KanvasServiceDeps,
} from './kanvas.ts';

class MemoryRepository implements KanvasJobRepository {
  private readonly assets = new Map<string, KanvasAssetRecord>();
  private readonly jobs = new Map<string, KanvasJobRecord>();

  constructor(initialAssets: KanvasAssetRecord[] = [], initialJobs: KanvasJobRecord[] = []) {
    for (const asset of initialAssets) {
      this.assets.set(asset.id, asset);
    }
    for (const job of initialJobs) {
      this.jobs.set(job.id, job);
    }
  }

  async getAssetById(assetId: string, userId: string): Promise<KanvasAssetRecord | null> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.userId !== userId) {
      return null;
    }
    return asset;
  }

  async insertJob(job: KanvasJobInsert): Promise<KanvasJobRecord> {
    const record: KanvasJobRecord = {
      id: job.id,
      userId: job.userId,
      projectId: job.projectId,
      studio: job.studio,
      modelId: job.modelId,
      externalRequestId: job.externalRequestId,
      jobType: job.jobType,
      status: job.status,
      progress: job.progress,
      resultUrl: job.resultUrl,
      errorMessage: job.errorMessage,
      config: job.config,
      inputAssets: job.inputAssets,
      resultPayload: job.resultPayload,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      updatedAt: job.updatedAt,
    };
    this.jobs.set(record.id, record);
    return record;
  }

  async updateJob(jobId: string, updates: KanvasJobUpdate): Promise<KanvasJobRecord> {
    const current = this.jobs.get(jobId);
    if (!current) {
      throw new Error('Job not found');
    }

    const next: KanvasJobRecord = {
      ...current,
      status: updates.status ?? current.status,
      progress: updates.progress ?? current.progress,
      resultUrl: updates.resultUrl ?? current.resultUrl,
      errorMessage: updates.errorMessage ?? current.errorMessage,
      externalRequestId: updates.externalRequestId ?? current.externalRequestId,
      resultPayload: updates.resultPayload ?? current.resultPayload,
      completedAt: updates.completedAt ?? current.completedAt,
      startedAt: updates.startedAt ?? current.startedAt,
      updatedAt: updates.updatedAt,
      config: updates.config ?? current.config,
    };
    this.jobs.set(jobId, next);
    return next;
  }

  async getJob(jobId: string, userId: string): Promise<KanvasJobRecord | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      return null;
    }
    return job;
  }
}

interface CreditTracker {
  reservations: number;
  commits: number;
  releases: number;
}

function createDeps(overrides?: {
  submit?: KanvasFalAdapter['submit'];
  poll?: KanvasFalAdapter['poll'];
  fetchResult?: KanvasFalAdapter['fetchResult'];
  reserve?: KanvasCreditsAdapter['reserve'];
  commit?: KanvasCreditsAdapter['commit'];
  release?: KanvasCreditsAdapter['release'];
}): KanvasServiceDeps & { tracker: CreditTracker } {
  const tracker: CreditTracker = {
    reservations: 0,
    commits: 0,
    releases: 0,
  };

  return {
    tracker,
    now() {
      return '2026-03-12T10:30:00.000Z';
    },
    randomId() {
      return 'job-1';
    },
    getCost() {
      return 20;
    },
    credits: {
      async reserve(input) {
        tracker.reservations += 1;
        if (overrides?.reserve) {
          return await overrides.reserve(input);
        }
        return { holdId: 'hold-1', skipped: false };
      },
      async commit(input) {
        tracker.commits += 1;
        if (overrides?.commit) {
          await overrides.commit(input);
        }
      },
      async release(input) {
        tracker.releases += 1;
        if (overrides?.release) {
          await overrides.release(input);
        }
      },
    },
    fal: {
      async submit(modelId, input) {
        if (overrides?.submit) {
          return await overrides.submit(modelId, input);
        }
        return {
          success: true,
          requestId: 'fal-1',
          statusUrl: 'https://queue.fal.run/status/fal-1',
          responseUrl: 'https://queue.fal.run/result/fal-1',
        };
      },
      async poll(requestId, statusUrl) {
        if (overrides?.poll) {
          return await overrides.poll(requestId, statusUrl);
        }
        return {
          success: true,
          status: 'COMPLETED',
          result: { images: [{ url: 'https://cdn.example.com/out.png' }] },
        };
      },
      async fetchResult(responseUrl) {
        if (overrides?.fetchResult) {
          return await overrides.fetchResult(responseUrl);
        }
        return { images: [{ url: 'https://cdn.example.com/out.png', width: 1024, height: 1024 }] };
      },
    },
  };
}

const imageAsset: KanvasAssetRecord = {
  id: 'asset-image-1',
  userId: 'user-1',
  projectId: null,
  assetType: 'image',
  originalFileName: 'portrait.png',
  url: 'https://cdn.example.com/portrait.png',
  previewUrl: null,
  thumbnailUrl: null,
  metadata: {},
};

const audioAsset: KanvasAssetRecord = {
  id: 'asset-audio-1',
  userId: 'user-1',
  projectId: null,
  assetType: 'audio',
  originalFileName: 'voice.mp3',
  url: 'https://cdn.example.com/voice.mp3',
  previewUrl: null,
  thumbnailUrl: null,
  metadata: {},
};

const videoAsset: KanvasAssetRecord = {
  id: 'asset-video-1',
  userId: 'user-1',
  projectId: null,
  assetType: 'video',
  originalFileName: 'clip.mp4',
  url: 'https://cdn.example.com/clip.mp4',
  previewUrl: null,
  thumbnailUrl: null,
  metadata: {},
};

function createImageRequest(): KanvasGenerationRequest {
  return {
    studio: 'image',
    mode: 'text-to-image',
    modelId: 'fal-ai/nano-banana-pro',
    prompt: 'A cinematic astronaut portrait',
  };
}

Deno.test('submitKanvasJob rejects missing authenticated user', async () => {
  const repository = new MemoryRepository([imageAsset]);
  const deps = createDeps();

  await Promise.all([
    (async () => {
      try {
        await submitKanvasJob(createImageRequest(), '', repository, deps);
        throw new Error('Expected submitKanvasJob to fail');
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Authenticated user')) {
          throw error;
        }
      }
    })(),
  ]);
});

Deno.test('submitKanvasJob propagates insufficient credits before submission', async () => {
  const repository = new MemoryRepository([imageAsset]);
  const deps = createDeps({
    reserve: async () => {
      throw new Error('Insufficient credits');
    },
  });

  try {
    await submitKanvasJob(createImageRequest(), 'user-1', repository, deps);
    throw new Error('Expected insufficient credits error');
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Insufficient credits') {
      throw error;
    }
  }
});

Deno.test('submitKanvasJob stores a queued Kanvas job after successful Fal submission', async () => {
  const repository = new MemoryRepository([imageAsset]);
  const deps = createDeps();
  const job = await submitKanvasJob(createImageRequest(), 'user-1', repository, deps);

  if (job.status !== 'queued') {
    throw new Error(`Expected queued status, received ${job.status}`);
  }
  if (job.externalRequestId !== 'fal-1') {
    throw new Error(`Expected Fal request id fal-1, received ${job.externalRequestId}`);
  }
  if (deps.tracker.reservations !== 1 || deps.tracker.commits !== 0 || deps.tracker.releases !== 0) {
    throw new Error('Unexpected credit counters after submit');
  }
});

Deno.test('refreshKanvasJob completes a job and commits credits when Fal finishes', async () => {
  const repository = new MemoryRepository([imageAsset], [
    {
      id: 'job-1',
      userId: 'user-1',
      projectId: null,
      studio: 'image',
      modelId: 'fal-ai/nano-banana-pro',
      externalRequestId: 'fal-1',
      jobType: 'image',
      status: 'queued',
      progress: 5,
      resultUrl: null,
      errorMessage: null,
      config: {
        request: createImageRequest(),
        queue: {
          statusUrl: 'https://queue.fal.run/status/fal-1',
          responseUrl: 'https://queue.fal.run/result/fal-1',
        },
        billing: {
          holdId: 'hold-1',
          skipped: false,
          amount: 20,
        },
      },
      inputAssets: [],
      resultPayload: null,
      createdAt: '2026-03-12T10:30:00.000Z',
      startedAt: '2026-03-12T10:30:00.000Z',
      completedAt: null,
      updatedAt: '2026-03-12T10:30:00.000Z',
    },
  ]);
  const deps = createDeps();

  const job = await refreshKanvasJob('job-1', 'user-1', repository, deps);

  if (job.status !== 'completed') {
    throw new Error(`Expected completed status, received ${job.status}`);
  }
  if (job.resultUrl !== 'https://cdn.example.com/out.png') {
    throw new Error(`Expected normalized result URL, received ${job.resultUrl}`);
  }
  if (deps.tracker.commits !== 1 || deps.tracker.releases !== 0) {
    throw new Error('Expected one commit and zero releases');
  }
});

Deno.test('refreshKanvasJob fails and refunds when Fal reports failure', async () => {
  const repository = new MemoryRepository([videoAsset, audioAsset], [
    {
      id: 'job-1',
      userId: 'user-1',
      projectId: null,
      studio: 'lipsync',
      modelId: 'fal-ai/sync-lipsync/v2',
      externalRequestId: 'fal-1',
      jobType: 'video',
      status: 'processing',
      progress: 55,
      resultUrl: null,
      errorMessage: null,
      config: {
        request: {
          studio: 'lipsync',
          mode: 'lip-sync',
          modelId: 'fal-ai/sync-lipsync/v2',
          assetSelections: {
            videoId: 'asset-video-1',
            audioId: 'asset-audio-1',
          },
        },
        queue: {
          statusUrl: 'https://queue.fal.run/status/fal-1',
          responseUrl: null,
        },
        billing: {
          holdId: 'hold-1',
          skipped: false,
          amount: 20,
        },
      },
      inputAssets: ['asset-video-1', 'asset-audio-1'],
      resultPayload: null,
      createdAt: '2026-03-12T10:30:00.000Z',
      startedAt: '2026-03-12T10:30:00.000Z',
      completedAt: null,
      updatedAt: '2026-03-12T10:30:00.000Z',
    },
  ]);
  const deps = createDeps({
    poll: async () => ({
      success: true,
      status: 'FAILED',
      error: 'Fal failed',
    }),
  });

  const job = await refreshKanvasJob('job-1', 'user-1', repository, deps);

  if (job.status !== 'failed') {
    throw new Error(`Expected failed status, received ${job.status}`);
  }
  if (deps.tracker.releases !== 1) {
    throw new Error('Expected exactly one refund release');
  }
});

Deno.test('refreshKanvasJob refunds when polling fails or times out', async () => {
  const repository = new MemoryRepository([], [
    {
      id: 'job-1',
      userId: 'user-1',
      projectId: null,
      studio: 'image',
      modelId: 'fal-ai/nano-banana-pro',
      externalRequestId: 'fal-1',
      jobType: 'image',
      status: 'processing',
      progress: 55,
      resultUrl: null,
      errorMessage: null,
      config: {
        request: createImageRequest(),
        queue: {
          statusUrl: 'https://queue.fal.run/status/fal-1',
          responseUrl: null,
        },
        billing: {
          holdId: 'hold-1',
          skipped: false,
          amount: 20,
        },
      },
      inputAssets: [],
      resultPayload: null,
      createdAt: '2026-03-12T10:30:00.000Z',
      startedAt: '2026-03-12T10:30:00.000Z',
      completedAt: null,
      updatedAt: '2026-03-12T10:30:00.000Z',
    },
  ]);
  const deps = createDeps({
    poll: async () => ({
      success: false,
      error: 'Timed out waiting for Fal',
    }),
  });

  const job = await refreshKanvasJob('job-1', 'user-1', repository, deps);

  if (job.status !== 'failed') {
    throw new Error(`Expected failed status, received ${job.status}`);
  }
  if (deps.tracker.releases !== 1) {
    throw new Error('Expected a refund release on poll failure');
  }
});

Deno.test('submitKanvasJob rejects unmapped models', async () => {
  const repository = new MemoryRepository([imageAsset, audioAsset, videoAsset]);
  const deps = createDeps();

  const request: KanvasGenerationRequest = {
    studio: 'image',
    mode: 'text-to-image',
    modelId: 'legacy-unmapped-model',
    prompt: 'Test prompt',
  };

  try {
    await submitKanvasJob(request, 'user-1', repository, deps);
    throw new Error('Expected unmapped model rejection');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Unmapped model')) {
      throw error;
    }
  }
});

Deno.test('submitKanvasJob allows audio-only talking-head models', async () => {
  const repository = new MemoryRepository([audioAsset]);
  let capturedInput: Record<string, unknown> | null = null;
  const deps = createDeps({
    submit: async (_modelId, input) => {
      capturedInput = input;
      return {
        success: true,
        requestId: 'fal-audio-only-1',
        statusUrl: 'https://queue.fal.run/status/fal-audio-only-1',
        responseUrl: 'https://queue.fal.run/result/fal-audio-only-1',
      };
    },
  });

  const request: KanvasGenerationRequest = {
    studio: 'lipsync',
    mode: 'talking-head',
    modelId: 'fal-ai/ltx-2.3/audio-to-video',
    prompt: 'Energetic performance lighting',
    assetSelections: {
      audioId: 'asset-audio-1',
    },
  };

  const job = await submitKanvasJob(request, 'user-1', repository, deps);

  if (job.status !== 'queued') {
    throw new Error(`Expected queued status, received ${job.status}`);
  }
  if (!capturedInput || capturedInput["audio_url"] !== audioAsset.url) {
    throw new Error('Expected audio URL to be forwarded for audio-only talking-head generation.');
  }
  if ("image_url" in capturedInput) {
    throw new Error('Audio-only talking-head generation should not require an image URL.');
  }
});

Deno.test('submitKanvasJob forwards a single reference asset for reference-to-video models', async () => {
  const repository = new MemoryRepository([videoAsset]);
  let capturedInput: Record<string, unknown> | null = null;
  const deps = createDeps({
    submit: async (_modelId, input) => {
      capturedInput = input;
      return {
        success: true,
        requestId: 'fal-r2v-1',
        statusUrl: 'https://queue.fal.run/status/fal-r2v-1',
        responseUrl: 'https://queue.fal.run/result/fal-r2v-1',
      };
    },
  });

  const request: KanvasGenerationRequest = {
    studio: 'video',
    mode: 'reference-to-video',
    modelId: 'gmi/wan2.7-r2v',
    prompt: 'Preserve the source identity and animate it.',
    assetSelections: {
      assetId: 'asset-video-1',
    },
  };

  const job = await submitKanvasJob(request, 'user-1', repository, deps);

  if (job.status !== 'queued') {
    throw new Error(`Expected queued status, received ${job.status}`);
  }
  if (!capturedInput || capturedInput["video_url"] !== videoAsset.url) {
    throw new Error('Expected reference-to-video generation to forward the selected video reference.');
  }
});
