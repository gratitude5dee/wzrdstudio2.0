-- Create the project-assets storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-assets', 'project-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload project assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to read their own assets
CREATE POLICY "Users can read own project assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to delete their own assets
CREATE POLICY "Users can delete own project assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access for CDN URLs
CREATE POLICY "Public read access for project assets"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'project-assets');