BEGIN;

ALTER TABLE quality_inspections
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS rescheduled_from_inspection_id TEXT,
  ADD COLUMN IF NOT EXISTS rescheduled_to_inspection_id TEXT;

CREATE TABLE IF NOT EXISTS quality_inspection_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  related_inspection_id TEXT,
  note TEXT,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_inspection_event_type_chk CHECK (event_type IN ('CANCELLED','RESCHEDULED')) NOT VALID
);

CREATE INDEX IF NOT EXISTS quality_inspection_events_inspection_idx
  ON quality_inspection_events(inspection_id, created_at ASC);
CREATE INDEX IF NOT EXISTS quality_inspection_events_scope_idx
  ON quality_inspection_events(tenant_id, company_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_inspections_rescheduled_from_idx
  ON quality_inspections(rescheduled_from_inspection_id)
  WHERE rescheduled_from_inspection_id IS NOT NULL;

ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_rescheduled_from_fkey
  FOREIGN KEY (rescheduled_from_inspection_id) REFERENCES quality_inspections(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_inspections ADD CONSTRAINT quality_inspections_rescheduled_to_fkey
  FOREIGN KEY (rescheduled_to_inspection_id) REFERENCES quality_inspections(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_inspection_events ADD CONSTRAINT quality_inspection_events_inspection_fkey
  FOREIGN KEY (inspection_id) REFERENCES quality_inspections(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_inspection_events ADD CONSTRAINT quality_inspection_events_related_fkey
  FOREIGN KEY (related_inspection_id) REFERENCES quality_inspections(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_inspection_events ADD CONSTRAINT quality_inspection_events_actor_fkey
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
