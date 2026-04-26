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

function mapAssetRow(row: Record<string, unknown>): KanvasAssetRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    projectId: asString(row.project_id),
    assetType: String(row.asset_type) as KanvasAssetRecord['assetType'],
    originalFileName: String(row.original_file_name),
    url: String(row.cdn_url),
    previewUrl: asString(row.preview_url),
    thumbnailUrl: asString(row.thumbnail_url),
    metadata: asRecord(row.media_metadata),
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
        .select('id, user_id, project_id, asset_type, original_file_name, cdn_url, preview_url, thumbnail_url, media_metadata')
        .eq('id', assetId)
        .eq('user_id', userId)
        .single();

      if (error || !data || !data.cdn_url) {
        return null;
      }

      return mapAssetRow(data as unknown as Record<string, unknown>);
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
