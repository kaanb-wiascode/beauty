BEGIN;

ALTER TABLE quality_cases
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS sla_escalation_level INTEGER NOT NULL DEFAULT 0;

ALTER TABLE quality_case_events
  DROP CONSTRAINT IF EXISTS quality_case_events_type_chk;

ALTER TABLE quality_case_events
  ADD CONSTRAINT quality_case_events_type_chk
  CHECK (event_type IN ('CREATED','ASSIGNED','STATUS_CHANGED','RESOLUTION_UPDATED','NOTE','SLA_BREACHED')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS quality_case_events_sla_breached_uq
  ON quality_case_events(case_id)
  WHERE event_type='SLA_BREACHED';

CREATE INDEX IF NOT EXISTS quality_cases_sla_breached_idx
  ON quality_cases(tenant_id, company_id, branch_id, sla_breached_at DESC)
  WHERE sla_breached_at IS NOT NULL;

COMMIT;
