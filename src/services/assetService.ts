import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

// The asset tables (project_assets, asset_usage, asset_collections, asset_collection_items)
// are not yet in the generated Supabase types. Cast to any to allow runtime queries.
const supabase = typedSupabase as any;
import type {
  AssetCollection,
  AssetFilters,
  AssetStats,
  AssetUploadRequest,
  AssetUploadResponse,
  AssetUsage,
  ProjectAsset,
} from "@/types/assets";

type ProjectAssetRow = any;
type ProjectAssetUpdate = any;
type AssetUsageRow = any;
type AssetCollectionRow = any;

const DEFAULT_STORAGE_LIMIT_BYTES = 50 * 1024 * 1024 * 1024;

function toJsonRecord(value: Record<string, unknown> | undefined): Json {
  return (value ?? {}) as Json;
}

function normalizeAssetRow(row: ProjectAssetRow): ProjectAsset {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    file_name: row.file_name ?? row.name ?? '',
    original_file_name: row.original_file_name ?? row.name ?? '',
    mime_type: row.mime_type ?? '',
    file_size_bytes: row.file_size_bytes ?? row.size ?? 0,
    asset_type: (row.asset_type ?? row.type ?? 'image') as ProjectAsset["asset_type"],
    asset_category: (row.asset_category ?? 'upload') as ProjectAsset["asset_category"],
    storage_provider: row.storage_provider ?? 'supabase',
    storage_bucket: row.storage_bucket ?? '',
    storage_path: row.storage_path ?? '',
    cdn_url: row.cdn_url ?? row.url ?? '',
    media_metadata:
      row.media_metadata && typeof row.media_metadata === "object" && !Array.isArray(row.media_metadata)
        ? row.media_metadata
        : (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}),
    processing_status: (row.processing_status ?? 'completed') as ProjectAsset["processing_status"],
    processing_error: row.processing_error ?? null,
    thumbnail_bucket: row.thumbnail_bucket ?? null,
    thumbnail_path: row.thumbnail_path ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    preview_bucket: row.preview_bucket ?? null,
    preview_path: row.preview_path ?? null,
    preview_url: row.preview_url ?? null,
    used_in_pages: row.used_in_pages ?? [],
    usage_count: row.usage_count ?? 0,
    visibility: (row.visibility ?? 'private') as ProjectAsset["visibility"],
    is_archived: row.is_archived ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    last_accessed_at: row.last_accessed_at ?? null,
  };
}

function normalizeUsageRow(row: AssetUsageRow): AssetUsage {
  return {
    id: row.id,
    asset_id: row.asset_id,
    used_in_table: row.used_in_table,
    used_in_record_id: row.used_in_record_id,
    used_in_field: row.used_in_field,
    usage_metadata:
      row.usage_metadata && typeof row.usage_metadata === "object" && !Array.isArray(row.usage_metadata)
        ? row.usage_metadata
        : {},
    created_at: row.created_at,
  };
}

function normalizeCollectionRow(row: AssetCollectionRow): AssetCollection {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    parent_collection_id: row.parent_collection_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("Authentication required");
  }

  return user.id;
}

function buildProjectAssetUpdate(updates: Partial<ProjectAsset>): ProjectAssetUpdate {
  const payload: ProjectAssetUpdate = {};

  if (updates.project_id !== undefined) payload.project_id = updates.project_id;
  if (updates.file_name !== undefined) payload.file_name = updates.file_name;
  if (updates.original_file_name !== undefined) payload.original_file_name = updates.original_file_name;
  if (updates.mime_type !== undefined) payload.mime_type = updates.mime_type;
  if (updates.file_size_bytes !== undefined) payload.file_size_bytes = updates.file_size_bytes;
  if (updates.asset_type !== undefined) payload.asset_type = updates.asset_type;
  if (updates.asset_category !== undefined) payload.asset_category = updates.asset_category;
  if (updates.storage_provider !== undefined) payload.storage_provider = updates.storage_provider;
  if (updates.storage_bucket !== undefined) payload.storage_bucket = updates.storage_bucket;
  if (updates.storage_path !== undefined) payload.storage_path = updates.storage_path;
  if (updates.cdn_url !== undefined) payload.cdn_url = updates.cdn_url;
  if (updates.media_metadata !== undefined) payload.media_metadata = updates.media_metadata;
  if (updates.processing_status !== undefined) payload.processing_status = updates.processing_status;
  if (updates.processing_error !== undefined) payload.processing_error = updates.processing_error;
  if (updates.thumbnail_bucket !== undefined) payload.thumbnail_bucket = updates.thumbnail_bucket;
  if (updates.thumbnail_path !== undefined) payload.thumbnail_path = updates.thumbnail_path;
  if (updates.thumbnail_url !== undefined) payload.thumbnail_url = updates.thumbnail_url;
  if (updates.preview_bucket !== undefined) payload.preview_bucket = updates.preview_bucket;
  if (updates.preview_path !== undefined) payload.preview_path = updates.preview_path;
  if (updates.preview_url !== undefined) payload.preview_url = updates.preview_url;
  if (updates.used_in_pages !== undefined) payload.used_in_pages = updates.used_in_pages;
  if (updates.usage_count !== undefined) payload.usage_count = updates.usage_count;
  if (updates.visibility !== undefined) payload.visibility = updates.visibility;
  if (updates.is_archived !== undefined) payload.is_archived = updates.is_archived;
  if (updates.last_accessed_at !== undefined) payload.last_accessed_at = updates.last_accessed_at;

  return payload;
}

export const assetService = {
  async upload(request: AssetUploadRequest): Promise<AssetUploadResponse> {
    // Explicitly pass auth token to avoid session race conditions
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error("No active session. Please sign in again.");
    }

    const { data, error } = await supabase.functions.invoke("asset-upload", {
      body: request,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      throw error;
    }

    const response = data as AssetUploadResponse | null;
    if (!response) {
      throw new Error("Asset upload returned an empty response");
    }

    if (response.asset) {
      return {
        ...response,
        asset: normalizeAssetRow(response.asset as ProjectAssetRow),
      };
    }

    return response;
  },

  async list(filters: AssetFilters = {}): Promise<ProjectAsset[]> {
    let query = supabase.from("project_assets").select("*");

    if (filters.projectId) {
      query = query.eq("project_id", filters.projectId);
    }
    if (filters.assetType?.length) {
      query = query.in("asset_type", filters.assetType);
    }
    if (filters.assetCategory?.length) {
      query = query.in("asset_category", filters.assetCategory);
    }
    if (filters.visibility?.length) {
      query = query.in("visibility", filters.visibility);
    }
    if (filters.processingStatus?.length) {
      query = query.in("processing_status", filters.processingStatus);
    }
    // Note: is_archived column may not exist on all project_assets schemas.
    // Skip filtering by is_archived to avoid 400 errors.
    if (filters.searchQuery?.trim()) {
      const term = filters.searchQuery.trim().replace(/[%_,]/g, " ");
      query = query.or(`original_file_name.ilike.%${term}%,file_name.ilike.%${term}%`);
    }
    if (filters.dateFrom) {
      query = query.gte("created_at", filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte("created_at", filters.dateTo);
    }

    query = query.order(filters.sortBy ?? "created_at", {
      ascending: filters.sortOrder === "asc",
    });

    if (typeof filters.limit === "number") {
      query = query.limit(filters.limit);
      if (typeof filters.offset === "number") {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data ?? []).map(normalizeAssetRow);
  },

  async get(assetId: string): Promise<ProjectAsset | null> {
    return this.getById(assetId);
  },

  async getById(assetId: string): Promise<ProjectAsset | null> {
    const { data, error } = await supabase
      .from("project_assets")
      .select("*")
      .eq("id", assetId)
      .single();

    if (error) {
      if ("code" in error && error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data ? normalizeAssetRow(data) : null;
  },

  async update(assetId: string, updates: Partial<ProjectAsset>): Promise<ProjectAsset> {
    const payload = buildProjectAssetUpdate(updates);
    const { data, error } = await supabase
      .from("project_assets")
      .update(payload)
      .eq("id", assetId)
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new Error("Asset update returned no data");
    }

    return normalizeAssetRow(data);
  },

  async delete(assetId: string): Promise<void> {
    const asset = await this.getById(assetId);
    if (!asset) {
      return;
    }

    await supabase
      .from("project_assets")
      .update({ is_archived: true })
      .eq("id", assetId);

    const removals: Array<Promise<unknown>> = [
      supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]),
    ];

    if (asset.thumbnail_bucket && asset.thumbnail_path) {
      removals.push(
        supabase.storage.from(asset.thumbnail_bucket).remove([asset.thumbnail_path])
      );
    }

    if (asset.preview_bucket && asset.preview_path) {
      removals.push(
        supabase.storage.from(asset.preview_bucket).remove([asset.preview_path])
      );
    }

    await Promise.all(removals);

    const { error } = await supabase.from("project_assets").delete().eq("id", assetId);
    if (error) {
      throw error;
    }
  },

  async archive(assetId: string): Promise<void> {
    const { error } = await supabase
      .from("project_assets")
      .update({ is_archived: true })
      .eq("id", assetId);

    if (error) {
      throw error;
    }
  },

  async restore(assetId: string): Promise<void> {
    const { error } = await supabase
      .from("project_assets")
      .update({ is_archived: false })
      .eq("id", assetId);

    if (error) {
      throw error;
    }
  },

  async trackUsage(
    assetId: string,
    usedInTable: string,
    usedInRecordId: string,
    usedInField?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const { error } = await supabase.from("asset_usage").insert({
      asset_id: assetId,
      used_in_table: usedInTable,
      used_in_record_id: usedInRecordId,
      used_in_field: usedInField ?? null,
      usage_metadata: toJsonRecord(metadata),
    });

    if (error) {
      throw error;
    }
  },

  async getUsageHistory(assetId: string): Promise<AssetUsage[]> {
    return assetService.getUsage(assetId);
  },

  async getUsage(assetId: string): Promise<AssetUsage[]> {
    const { data, error } = await supabase
      .from("asset_usage")
      .select("*")
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map(normalizeUsageRow);
  },

  async getStats(projectId?: string): Promise<AssetStats> {
    const assets = await assetService.list({ projectId, includeArchived: false });
    const stats: AssetStats = {
      totalAssets: 0,
      totalSizeBytes: 0,
      byType: {},
    };

    for (const asset of assets) {
      stats.totalAssets += 1;
      stats.totalSizeBytes += asset.file_size_bytes;
      const current = stats.byType[asset.asset_type] ?? { count: 0, sizeBytes: 0 };
      current.count += 1;
      current.sizeBytes += asset.file_size_bytes;
      stats.byType[asset.asset_type] = current;
    }

    return stats;
  },

  async getStorageStats(projectId?: string): Promise<{
    totalAssets: number;
    totalSizeBytes: number;
    storageUsed: number;
    storageLimit: number;
  }> {
    const stats = await this.getStats(projectId);
    return {
      totalAssets: stats.totalAssets,
      totalSizeBytes: stats.totalSizeBytes,
      storageUsed: stats.totalSizeBytes,
      storageLimit: DEFAULT_STORAGE_LIMIT_BYTES,
    };
  },

  async createCollection(
    name: string,
    options?: {
      projectId?: string;
      description?: string;
      color?: string;
      icon?: string;
      parentCollectionId?: string | null;
    }
  ): Promise<AssetCollection> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("asset_collections")
      .insert({
        user_id: userId,
        project_id: options?.projectId ?? null,
        name,
        description: options?.description ?? null,
        color: options?.color ?? null,
        icon: options?.icon ?? null,
        parent_collection_id: options?.parentCollectionId ?? null,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw error ?? new Error("Collection creation returned no data");
    }

    return normalizeCollectionRow(data);
  },

  async listCollections(projectId?: string): Promise<AssetCollection[]> {
    let query = supabase.from("asset_collections").select("*").order("created_at", {
      ascending: false,
    });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data ?? []).map(normalizeCollectionRow);
  },

  async addToCollection(collectionId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    const payload = assetIds.map((assetId) => ({
      collection_id: collectionId,
      asset_id: assetId,
    }));

    const { error } = await supabase.from("asset_collection_items").upsert(payload, {
      onConflict: "collection_id,asset_id",
      ignoreDuplicates: true,
    });

    if (error) {
      throw error;
    }
  },

  async removeFromCollection(collectionId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    const { error } = await supabase
      .from("asset_collection_items")
      .delete()
      .eq("collection_id", collectionId)
      .in("asset_id", assetIds);

    if (error) {
      throw error;
    }
  },

  async getDownloadUrl(assetId: string): Promise<string> {
    const asset = await this.getById(assetId);
    if (!asset) {
      throw new Error("Asset not found");
    }

    if (asset.cdn_url) {
      return asset.cdn_url;
    }

    return supabase.storage
      .from(asset.storage_bucket)
      .getPublicUrl(asset.storage_path).data.publicUrl;
  },

  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
      };
      reader.onerror = (error) => reject(error);
    });
  },

  collections: {
    async list(projectId?: string): Promise<AssetCollection[]> {
      return assetService.listCollections(projectId);
    },
    async create(name: string): Promise<AssetCollection> {
      return assetService.createCollection(name);
    },
    async delete(collectionId: string): Promise<void> {
      const { error } = await supabase
        .from("asset_collections")
        .delete()
        .eq("id", collectionId);

      if (error) {
        throw error;
      }
    },
    async addAssets(collectionId: string, assetIds: string[]): Promise<void> {
      await assetService.addToCollection(collectionId, assetIds);
    },
    async addAsset(collectionId: string, assetId: string): Promise<void> {
      await assetService.addToCollection(collectionId, [assetId]);
    },
    async removeAssets(collectionId: string, assetIds: string[]): Promise<void> {
      await assetService.removeFromCollection(collectionId, assetIds);
    },
    async removeAsset(collectionId: string, assetId: string): Promise<void> {
      await assetService.removeFromCollection(collectionId, [assetId]);
    },
    async getAssets(collectionId: string): Promise<ProjectAsset[]> {
      const { data, error } = await supabase
        .from("asset_collection_items")
        .select("asset_id")
        .eq("collection_id", collectionId);

      if (error) {
        throw error;
      }

      const assetIds = (data ?? []).map((item) => item.asset_id);
      if (assetIds.length === 0) {
        return [];
      }

      const { data: assets, error: assetsError } = await supabase
        .from("project_assets")
        .select("*")
        .in("id", assetIds)
        .order("created_at", { ascending: false });

      if (assetsError) {
        throw assetsError;
      }

      return (assets ?? []).map(normalizeAssetRow);
    },
  },
};
