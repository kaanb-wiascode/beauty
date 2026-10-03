BEGIN;

INSERT INTO "permissions" ("id", "resource", "action", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'training', 'read', 'training and competency read permission', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'training', 'manage', 'training and competency manage permission', CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."resource"='training' AND p."action" IN ('read','manage')
WHERE r."slug"='owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

ALTER TABLE training_assignments
  ADD COLUMN IF NOT EXISTS completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS training_assignment_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_assignment_events_type_chk CHECK(event_type IN ('CREATED','STARTED','COMPLETED','CANCELLED','EXPIRED','DUE_CHANGED'))
);

CREATE INDEX IF NOT EXISTS training_assignment_events_assignment_idx ON training_assignment_events(assignment_id,created_at);
CREATE INDEX IF NOT EXISTS training_assignment_events_scope_idx ON training_assignment_events(tenant_id,company_id,branch_id,created_at DESC);
CREATE INDEX IF NOT EXISTS training_assignments_due_idx ON training_assignments(tenant_id,company_id,branch_id,due_at) WHERE status IN ('ASSIGNED','IN_PROGRESS') AND due_at IS NOT NULL;

COMMIT;
