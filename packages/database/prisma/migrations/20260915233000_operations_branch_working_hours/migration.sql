CREATE TABLE IF NOT EXISTS operations_branch_working_hours (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT operations_branch_working_hours_interval_chk CHECK (closes_at > opens_at),
  CONSTRAINT operations_branch_working_hours_scope_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT operations_branch_working_hours_unique UNIQUE (tenant_id, company_id, branch_id, weekday, opens_at, closes_at)
);

CREATE INDEX IF NOT EXISTS operations_branch_working_hours_scope_idx
  ON operations_branch_working_hours (tenant_id, company_id, branch_id, weekday, active);

CREATE OR REPLACE FUNCTION enforce_operations_branch_working_hours_scope()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM branches b
    WHERE b.id = NEW.branch_id
      AND b."tenantId" = NEW.tenant_id
      AND b."companyId" = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'OPERATIONS_BRANCH_WORKING_HOURS_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS operations_branch_working_hours_scope_guard ON operations_branch_working_hours;
CREATE TRIGGER operations_branch_working_hours_scope_guard
BEFORE INSERT OR UPDATE ON operations_branch_working_hours
FOR EACH ROW EXECUTE FUNCTION enforce_operations_branch_working_hours_scope();
