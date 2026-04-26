-- Drop the existing policy that lacks WITH CHECK
DROP POLICY IF EXISTS "Users can manage their project assets" ON public.project_assets;

-- SELECT: users can see assets in their projects or unlinked assets they own (via metadata)
CREATE POLICY "Users can view project assets"
ON public.project_assets FOR SELECT
TO authenticated
USING (
  project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  OR (project_id IS NULL AND (metadata->>'user_id')::text = auth.uid()::text)
);

-- INSERT: users can insert assets linked to their projects or unlinked
CREATE POLICY "Users can insert project assets"
ON public.project_assets FOR INSERT
TO authenticated
WITH CHECK (
  project_id IS NULL
  OR project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);

-- UPDATE: users can update assets in their projects
CREATE POLICY "Users can update project assets"
ON public.project_assets FOR UPDATE
TO authenticated
USING (
  project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  OR (project_id IS NULL AND (metadata->>'user_id')::text = auth.uid()::text)
);

-- DELETE: users can delete assets in their projects
CREATE POLICY "Users can delete project assets"
ON public.project_assets FOR DELETE
TO authenticated
USING (
  project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  OR (project_id IS NULL AND (metadata->>'user_id')::text = auth.uid()::text)
);