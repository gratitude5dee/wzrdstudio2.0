UPDATE storage.buckets
SET file_size_limit = 52428800  -- 50 MB
WHERE id IN ('project-assets', 'audio');