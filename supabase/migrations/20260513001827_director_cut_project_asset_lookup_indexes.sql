-- Speed up Director's Cut fallback lookups for generated shot media linked by shot_id.
-- The project has had both a rich asset schema and a legacy asset schema in
-- circulation, so create only the index shape that matches the deployed table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_assets'
      AND column_name IN (
        'user_id',
        'project_id',
        'asset_type',
        'asset_category',
        'processing_status',
        'is_archived',
        'cdn_url',
        'media_metadata',
        'created_at'
      )
    GROUP BY table_schema, table_name
    HAVING COUNT(*) = 9
  ) THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_project_assets_director_cut_generated_media
      ON public.project_assets (user_id, project_id, asset_type, created_at DESC)
      WHERE asset_category = ''generated''
        AND processing_status = ''completed''
        AND is_archived = false
        AND asset_type IN (''image'', ''video'')
        AND cdn_url IS NOT NULL
        AND (media_metadata->>''shot_id'') IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_assets'
      AND column_name IN ('project_id', 'type', 'url', 'metadata', 'created_at')
    GROUP BY table_schema, table_name
    HAVING COUNT(*) = 5
  ) THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_project_assets_director_cut_legacy_media
      ON public.project_assets (project_id, type, created_at DESC)
      WHERE type IN (''image'', ''video'')
        AND url IS NOT NULL
        AND (metadata->>''shot_id'') IS NOT NULL
    ';
  END IF;
END $$;
