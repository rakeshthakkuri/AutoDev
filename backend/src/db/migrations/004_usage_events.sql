-- Usage metering for authenticated generations.

CREATE TABLE IF NOT EXISTS usage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  tokens_used     INTEGER,
  duration_ms     INTEGER,
  llm_provider    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_user_created ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_event_type ON usage_events(event_type);

CREATE OR REPLACE VIEW monthly_usage AS
SELECT
  user_id,
  date_trunc('month', created_at)::date AS month,
  COUNT(*) FILTER (WHERE event_type = 'generation')::int AS generations,
  COALESCE(SUM(tokens_used), 0)::bigint AS tokens_used
FROM usage_events
WHERE user_id IS NOT NULL
GROUP BY user_id, date_trunc('month', created_at);
