CREATE TABLE IF NOT EXISTS generation_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  job_id         TEXT NOT NULL,
  llm_provider   TEXT DEFAULT 'gemini',
  agent_version  TEXT DEFAULT 'v2',
  duration_ms    INTEGER,
  file_count     INTEGER,
  success        BOOLEAN NOT NULL,
  error_type     TEXT,
  tokens_used    INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_events_project_id ON generation_events(project_id);
CREATE INDEX IF NOT EXISTS idx_gen_events_job_id     ON generation_events(job_id);
CREATE INDEX IF NOT EXISTS idx_gen_events_success    ON generation_events(success);
CREATE INDEX IF NOT EXISTS idx_gen_events_created_at ON generation_events(created_at DESC);
