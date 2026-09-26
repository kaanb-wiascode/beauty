-- Recover obviously stale sync runs before enforcing single active claim semantics.
UPDATE finance_integration_sync_runs
SET status='FAILED',
    completed_at=COALESCE(completed_at,NOW()),
    error_message=COALESCE(error_message,'STALE_SYNC_RUN_RECOVERED_DURING_MIGRATION')
WHERE status='RUNNING'
  AND started_at < NOW() - INTERVAL '30 minutes';

-- If historical duplicate RUNNING rows exist for the same integration, keep only the newest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY integration_id
           ORDER BY started_at DESC, id DESC
         ) AS rn
  FROM finance_integration_sync_runs
  WHERE status='RUNNING'
)
UPDATE finance_integration_sync_runs r
SET status='FAILED',
    completed_at=COALESCE(r.completed_at,NOW()),
    error_message=COALESCE(r.error_message,'DUPLICATE_SYNC_RUN_RECOVERED_DURING_MIGRATION')
FROM ranked
WHERE r.id=ranked.id
  AND ranked.rn>1;

CREATE UNIQUE INDEX IF NOT EXISTS finance_integration_sync_runs_one_running_uq
  ON finance_integration_sync_runs(integration_id)
  WHERE status='RUNNING';
