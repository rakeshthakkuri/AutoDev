-- Projects table: tracks every generation job from creation to completion.

CREATE TABLE IF NOT EXISTS projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         TEXT UNIQUE NOT NULL,
  session_id     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'generating', 'complete', 'failed')),
  prompt         TEXT NOT NULL,
  requirements   JSONB,
  plan           JSONB,
  storage_path   TEXT,
  progress       INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  files_generated INTEGER DEFAULT 0,
  total_files    INTEGER DEFAULT 0,
  error_message  TEXT,
  agent_version  TEXT DEFAULT 'v2',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_session_id  ON projects(session_id);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at  ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_job_id      ON projects(job_id);

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_projects_updated_at ON projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
