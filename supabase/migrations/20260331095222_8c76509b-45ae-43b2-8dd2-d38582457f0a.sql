
-- Fix execution_runs: scope through project ownership
DROP POLICY IF EXISTS "Users can view their own execution runs" ON execution_runs;
CREATE POLICY "Users can view own execution runs" ON execution_runs FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create execution runs" ON execution_runs;
CREATE POLICY "Users can create own execution runs" ON execution_runs FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "System can update execution runs" ON execution_runs;
CREATE POLICY "System updates execution runs" ON execution_runs FOR UPDATE
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- Fix execution_node_status: scope through parent run -> project ownership
DROP POLICY IF EXISTS "System can manage node execution status" ON execution_node_status;
CREATE POLICY "System manages node status" ON execution_node_status FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "Users can view node execution status" ON execution_node_status;
CREATE POLICY "Users view own node status" ON execution_node_status FOR SELECT
  USING (run_id IN (
    SELECT id FROM execution_runs
    WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  ));
