BEGIN;

ALTER TABLE training_certificates
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS renewal_assignment_id TEXT REFERENCES training_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS renewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE training_certificates DROP CONSTRAINT IF EXISTS training_certificates_status_chk;
ALTER TABLE training_certificates ADD CONSTRAINT training_certificates_status_chk
  CHECK(status IN ('ACTIVE','EXPIRED','REVOKED','RENEWAL_ASSIGNED'));

CREATE UNIQUE INDEX IF NOT EXISTS training_certificates_renewal_assignment_uq
  ON training_certificates(renewal_assignment_id) WHERE renewal_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS training_certificates_expiry_idx
  ON training_certificates(tenant_id,company_id,expires_at)
  WHERE status='ACTIVE' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_certificate_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  certificate_id TEXT NOT NULL REFERENCES training_certificates(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_certificate_events_type_chk CHECK(event_type IN ('ISSUED','EXPIRED','REVOKED','RENEWAL_ASSIGNED'))
);
CREATE INDEX IF NOT EXISTS training_certificate_events_certificate_idx ON training_certificate_events(certificate_id,created_at);

ALTER TABLE training_assignment_events DROP CONSTRAINT IF EXISTS training_assignment_events_type_chk;
ALTER TABLE training_assignment_events ADD CONSTRAINT training_assignment_events_type_chk
  CHECK(event_type IN ('CREATED','STARTED','COMPLETED','CANCELLED','EXPIRED','DUE_CHANGED','COURSE_VERSION_PINNED','EXAM_SUBMITTED','PRACTICAL_ASSESSED','RESULT_FINALIZED','CERTIFICATE_ISSUED','CERTIFICATE_RENEWAL_ASSIGNED'));

COMMIT;
