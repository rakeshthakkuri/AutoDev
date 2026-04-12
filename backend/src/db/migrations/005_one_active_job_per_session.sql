-- At most one pending or generating row per session (cross-instance safety).
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_job_per_session
  ON projects (session_id)
  WHERE status IN ('pending', 'generating');
