-- Validation / import-repair metrics on generation_events
ALTER TABLE generation_events
  ADD COLUMN IF NOT EXISTS import_errors_initial   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS import_errors_remaining INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_packages        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_passes           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fully_validated         BOOLEAN DEFAULT NULL;

CREATE OR REPLACE VIEW generation_quality AS
SELECT
  DATE_TRUNC('day', created_at)                              AS day,
  COUNT(*)                                                   AS total_generations,
  COUNT(*) FILTER (WHERE success = TRUE)                     AS successful,
  ROUND(AVG(import_errors_initial)::numeric, 2)              AS avg_import_errors,
  COUNT(*) FILTER (WHERE import_errors_remaining = 0
    AND success = TRUE)                                      AS clean_generations,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE import_errors_remaining = 0 AND success = TRUE)
    / NULLIF(COUNT(*) FILTER (WHERE success = TRUE), 0)
  , 2)                                                       AS clean_rate_pct,
  ROUND(AVG(repair_passes) FILTER (WHERE success = TRUE)::numeric, 2)   AS avg_repair_passes,
  ROUND(AVG(duration_ms) FILTER (WHERE success = TRUE)::numeric, 2)     AS avg_duration_ms
FROM generation_events
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;
