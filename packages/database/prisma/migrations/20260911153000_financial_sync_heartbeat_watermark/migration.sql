ALTER TABLE finance_integration_sync_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

UPDATE finance_integration_sync_runs
SET heartbeat_at = COALESCE(heartbeat_at, started_at)
WHERE status = 'RUNNING';

CREATE INDEX IF NOT EXISTS finance_integration_sync_runs_running_heartbeat_idx
  ON finance_integration_sync_runs(heartbeat_at)
  WHERE status = 'RUNNING';
