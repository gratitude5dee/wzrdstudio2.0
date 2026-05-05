import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCatalogModelById } from './ai-model-catalog.ts';
import {
  executeFalModel,
  pollFalStatus,
} from './falai-client.ts';
import {
  executeGmiQueueModel,
  pollGmiQueueStatus,
} from './gmi-client.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getCreditCostForModel,
  releaseCredits,
  reserveCredits,
} from './credits.ts';
import type {
  KanvasAssetRecord,
  KanvasBillingConfig,
  KanvasCreditsAdapter,
  KanvasFalAdapter,
  KanvasJobConfig,
  KanvasJobInsert,
  KanvasJobRecord,
  KanvasJobRepository,
  KanvasJobUpdate,
  KanvasMediaType,
  KanvasNormalizedResult,
  KanvasQueueConfig,
  KanvasServiceDeps,
} from './kanvas.ts';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toQueueConfig(value: unknown): KanvasQueueConfig {
  const data = asRecord(value);
  return {
    statusUrl: asString(data.statusUrl),
    responseUrl: asString(data.responseUrl),
  };
}

function toBillingConfig(value: unknown): KanvasBillingConfig {
  const data = asRecord(value);
  return {
    holdId: asString(data.holdId),
    skipped: data.skipped === true,
    amount: asNumber(data.amount) ?? 0,
  };
}

function toJobConfig(value: unknown): KanvasJobConfig {
  const data = asRecord(value);
  return {
    request: data.request as KanvasJobConfig['request'],
    queue: toQueueConfig(data.queue),
    billing: toBillingConfig(data.billing),
  };
}

function toNormalizedResult(value: unknown): KanvasNormalizedResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as KanvasNormalizedResult;
}

function mapAssetRow(row: Record<string, unknown>, fallbackUserId: string): KanvasAssetRecord {
  const metadata = asRecord(row.media_metadata ?? row.metadata);
  const assetType = asString(row.asset_type) ?? asString(row.type) ?? asString(metadata.asset_type) ?? 'image';
  const originalFileName =
    asString(row.original_file_name) ??
    asString(row.file_name) ??
    asString(row.name) ??
    asString(metadata.original_file_name) ??
    'asset';
  const url = asString(row.cdn_url) ?? asString(row.url) ?? asString(metadata.url) ?? '';

  return {
    id: String(row.id),
    userId: asString(row.user_id) ?? asString(metadata.user_id) ?? fallbackUserId,
    projectId: asString(row.project_id),
    assetType: assetType as KanvasAssetRecord['assetType'],
    originalFileName,
    url,
    previewUrl: asString(row.preview_url),
    thumbnailUrl: asString(row.thumbnail_url),
    metadata,
  };
}

function mapJobRow(row: Record<string, unknown>): KanvasJobRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    projectId: asString(row.project_id),
    studio: String(row.studio) as KanvasJobRecord['studio'],
    modelId: String(row.model_id),
    externalRequestId: asString(row.external_request_id),
    jobType: String(row.job_type) as KanvasMediaType,
    status: String(row.status) as KanvasJobRecord['status'],
    progress: asNumber(row.progress),
    resultUrl: asString(row.result_url),
    errorMessage: asString(row.error_message),
    config: toJobConfig(row.config),
    inputAssets: asStringArray(row.input_assets),
    resultPayload: toNormalizedResult(row.result_payload),
    createdAt: String(row.created_at),
    startedAt: asString(row.started_at),
    completedAt: asString(row.completed_at),
    updatedAt: String(row.updated_at),
  };
}

function toDbInsert(job: KanvasJobInsert): Record<string, unknown> {
  return {
    id: job.id,
    user_id: job.userId,
    project_id: job.projectId,
    studio: job.studio,
    model_id: job.modelId,
    external_request_id: job.externalRequestId,
    job_type: job.jobType,
    status: job.status,
    progress: job.progress,
    result_url: job.resultUrl,
    error_message: job.errorMessage,
    config: job.config,
    input_assets: job.inputAssets,
    result_payload: job.resultPayload,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    updated_at: job.updatedAt,
  };
}

function toDbUpdate(job: KanvasJobUpdate): Record<string, unknown> {
  const update: Record<string, unknown> = {
    updated_at: job.updatedAt,
  };

  if (job.status) update.status = job.status;
  if (job.progress !== undefined) update.progress = job.progress;
  if (job.resultUrl !== undefined) update.result_url = job.resultUrl;
  if (job.errorMessage !== undefined) update.error_message = job.errorMessage;
  if (job.externalRequestId !== undefined) update.external_request_id = job.externalRequestId;
  if (job.resultPayload !== undefined) update.result_payload = job.resultPayload;
  if (job.completedAt !== undefined) update.completed_at = job.completedAt;
  if (job.startedAt !== undefined) update.started_at = job.startedAt;
  if (job.config !== undefined) update.config = job.config;

  return update;
}

export function createKanvasRepository(supabase: SupabaseClient): KanvasJobRepository {
  return {
    async getAssetById(assetId, userId) {
      const { data, error } = await supabase
        .from('project_assets')
        .select('*')
        .eq('id', assetId)
        .single();

      if (error || !data) {
        return null;
      }

      const row = data as unknown as Record<string, unknown>;
      const metadata = asRecord(row.media_metadata ?? row.metadata);
      const rowUserId = asString(row.user_id) ?? asString(metadata.user_id);
      const projectId = asString(row.project_id);
      const url = asString(row.cdn_url) ?? asString(row.url) ?? asString(metadata.url);

      if (!url) {
        return null;
      }

      if (rowUserId && rowUserId !== userId) {
        return null;
      }

      if (!rowUserId && projectId) {
        const { data: project } = await supabase
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!project) {
          return null;
        }
      }

      if (!rowUserId && !projectId) {
        return null;
      }

      return mapAssetRow(row, userId);
    },

    async insertJob(job) {
      const { data, error } = await supabase
        .from('generation_jobs')
        .insert(toDbInsert(job) as never)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Failed to insert Kanvas job.');
      }

      return mapJobRow(data as unknown as Record<string, unknown>);
    },

    async updateJob(jobId, updates) {
      const { data, error } = await supabase
        .from('generation_jobs')
        .update(toDbUpdate(updates) as never)
        .eq('id', jobId)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Failed to update Kanvas job.');
      }

      return mapJobRow(data as unknown as Record<string, unknown>);
    },

    async getJob(jobId, userId) {
      const { data, error } = await supabase
        .from('generation_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return mapJobRow(data as unknown as Record<string, unknown>);
    },

    async saveGeneratedAsset(input) {
      const { data: existing } = await supabase
        .from('project_assets')
        .select('id')
        .eq('url', input.url)
        .maybeSingle();

      if (existing?.id) {
        return String(existing.id);
      }

      const now = new Date().toISOString();
      const extension = input.mediaType === 'video' ? 'mp4' : 'png';
      const { data, error } = await supabase
        .from('project_assets')
        .insert({
          project_id: input.projectId,
          name: `kanvas-${input.mediaType}-${input.jobId}.${extension}`,
          url: input.url,
          thumbnail_url: input.thumbnailUrl ?? input.url,
          type: input.mediaType,
          size: 0,
          tags: ['generated', 'kanvas', input.generationRole ?? 'primary'],
          metadata: {
            user_id: input.userId,
            source: 'kanvas',
            job_id: input.jobId,
            model_id: input.modelId,
            generation_role: input.generationRole ?? 'primary',
            url: input.url,
          },
          created_at: now,
        } as never)
        .select('id')
        .single();

      if (error || !data) {
        console.warn('[kanvas] Failed to save generated asset:', error?.message);
        return null;
      }

      return String(data.id);
    },

    async linkBlueprintImage(input) {
      const { data: existing } = await supabase
        .from('character_blueprint_images')
        .select('id')
        .eq('blueprint_id', input.blueprintId)
        .eq('image_url', input.imageUrl)
        .maybeSingle();

      if (existing?.id) {
        return;
      }

      const { count } = await supabase
        .from('character_blueprint_images')
        .select('id', { count: 'exact', head: true })
        .eq('blueprint_id', input.blueprintId);

      const { error } = await supabase
        .from('character_blueprint_images')
        .insert({
          blueprint_id: input.blueprintId,
          asset_id: input.assetId,
          image_url: input.imageUrl,
          label: `Kanvas ${input.generationRole}`,
          generation_role: input.generationRole,
          generation_metadata: input.generationMetadata,
          is_primary: (count ?? 0) === 0,
          sort_order: count ?? 0,
        } as never);

      if (error) {
        console.warn('[kanvas] Failed to link blueprint image:', error.message);
      }
    },
  };
}

export function createKanvasCreditsAdapter(supabase: SupabaseClient): KanvasCreditsAdapter {
  return {
    async reserve(input) {
      const reservation = await reserveCredits({
        supabase,
        userId: input.userId,
        resourceType: input.resourceType,
        requestedAmount: input.amount,
        referenceType: 'kanvas_job',
        referenceId: input.referenceId,
        idempotencyKey: buildCreditIdempotencyKey('kanvas', input.userId, input.referenceId, input.modelId),
        metadata: {
          endpoint: 'kanvas',
          model_id: input.modelId,
          user_id: input.userId,
        },
      });

      return {
        holdId: reservation.holdId,
        skipped: reservation.skipped,
      };
    },

    async commit(input) {
      await commitCredits({
        supabase,
        holdId: input.holdId,
        skipped: input.skipped,
        amount: input.amount,
        userId: input.userId,
        metadata: {
          endpoint: 'kanvas',
          model_id: input.modelId,
          request_id: input.requestId,
          user_id: input.userId,
        },
      });
    },

    async release(input) {
      await releaseCredits({
        supabase,
        holdId: input.holdId,
        skipped: input.skipped,
        amount: input.amount,
        reason: input.reason,
        userId: input.userId,
        metadata: {
          endpoint: 'kanvas',
          model_id: input.modelId,
          request_id: input.requestId,
          user_id: input.userId,
        },
      });
    },
  };
}

async function fetchFalResponse(responseUrl: string): Promise<unknown> {
  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) {
    throw new Error('FAL_KEY environment variable is not set.');
  }

  const response = await fetch(responseUrl, {
    headers: {
      Authorization: `Key ${falKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Fal result (${response.status}).`);
  }

  return await response.json();
}

export const kanvasFalAdapter: KanvasFalAdapter = {
  async submit(modelId, input) {
    const catalogModel = await getCatalogModelById(modelId, { enabledOnly: false });

    // ── Route GMI Cloud models to the GMI request queue ─────────────────
    if (catalogModel?.provider === 'gmi-cloud') {
      const response = await executeGmiQueueModel(catalogModel.endpointId, input, catalogModel.payloadKeys);
      return {
        success: response.success,
        requestId: response.requestId,
        statusUrl: response.statusUrl ?? null,
        responseUrl: null,
        data: response.data,
        error: response.error,
      };
    }

    // ── Default: Fal AI ─────────────────────────────────────────────────
    const response = await executeFalModel(modelId, input, 'queue');
    return {
      success: response.success,
      requestId: response.requestId,
      statusUrl: response.statusUrl ?? null,
      responseUrl: response.responseUrl ?? null,
      data: response.data,
      error: response.error,
    };
  },

  async poll(requestId, statusUrl) {
    // ── Detect GMI status URLs and poll the GMI API ─────────────────────
    if (statusUrl && statusUrl.includes('gmicloud.ai')) {
      const response = await pollGmiQueueStatus(requestId);
      const data = asRecord(response.data);
      const status = asString(data.status);

      // Extract result from GMI outcome
      const outcome = asRecord(data.outcome);
      const hasOutcome = outcome && Object.keys(outcome).length > 0;

      // Map GMI statuses to the Fal-compatible status names
      let mappedStatus: string | undefined;
      if (status === 'success' && hasOutcome) mappedStatus = 'COMPLETED';
      else if (status === 'success' && !hasOutcome) {
        // Race condition: status is success but outcome not yet populated
        console.log('[kanvas-runtime] GMI success but empty outcome, treating as IN_PROGRESS. Raw:', JSON.stringify(data));
        mappedStatus = 'IN_PROGRESS';
      }
      else if (status === 'failed' || status === 'cancelled') mappedStatus = 'FAILED';
      else mappedStatus = 'IN_PROGRESS';

      return {
        success: response.success,
        status: mappedStatus,
        queuePosition: undefined,
        result: hasOutcome ? outcome : undefined,
        logs: [],
        error: response.error,
      };
    }

    // ── Default: Fal AI polling ─────────────────────────────────────────
    const response = await pollFalStatus(requestId, statusUrl ?? undefined);
    return {
      success: response.success,
      status: asString(asRecord(response.data).status) ?? undefined,
      queuePosition: asNumber(asRecord(response.data).queue_position) ?? undefined,
      result: asRecord(response.data).result,
      logs: Array.isArray(asRecord(response.data).logs) ? (asRecord(response.data).logs as unknown[]) : [],
      error: response.error,
    };
  },

  async fetchResult(responseUrl) {
    // GMI results are fetched inline during poll; this is only for Fal
    return await fetchFalResponse(responseUrl);
  },
};

export function createKanvasServiceDeps(supabase: SupabaseClient): KanvasServiceDeps {
  return {
    now() {
      return new Date().toISOString();
    },
    randomId() {
      return crypto.randomUUID();
    },
    getCost(modelId, mediaType) {
      return getCreditCostForModel(modelId, mediaType);
    },
    credits: createKanvasCreditsAdapter(supabase),
    fal: kanvasFalAdapter,
  };
}
