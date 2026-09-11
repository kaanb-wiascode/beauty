BEGIN;

ALTER TABLE quality_inspection_schedules
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS last_planned_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS last_error TEXT;

DO $$ BEGIN
  ALTER TABLE quality_inspection_schedules
    ADD CONSTRAINT quality_inspection_schedule_cadence_chk
    CHECK (UPPER(cadence) IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS quality_inspection_schedule_due_idx
  ON quality_inspection_schedules(tenant_id, company_id, branch_id, next_due_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS quality_inspection_schedule_lease_idx
  ON quality_inspection_schedules(lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

ALTER TABLE quality_findings
  ADD COLUMN IF NOT EXISTS overdue_at TIMESTAMP(3);

ALTER TABLE quality_capa_plans
  ADD COLUMN IF NOT EXISTS overdue_at TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS quality_findings_overdue_idx
  ON quality_findings(tenant_id, company_id, branch_id, overdue_at)
  WHERE status <> 'CLOSED';

CREATE INDEX IF NOT EXISTS quality_capa_overdue_idx
  ON quality_capa_plans(tenant_id, company_id, branch_id, overdue_at)
  WHERE status <> 'CLOSED';

ALTER TABLE quality_capa_events DROP CONSTRAINT IF EXISTS quality_capa_event_type_chk;
ALTER TABLE quality_capa_events
  ADD CONSTRAINT quality_capa_event_type_chk
  CHECK (event_type IN ('CREATED','ASSIGNED','STATUS_CHANGED','VERIFIED','NOTE','OVERDUE')) NOT VALID;

COMMIT;
