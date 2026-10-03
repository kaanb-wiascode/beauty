CREATE TABLE IF NOT EXISTS operations_branch_working_hours (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  opens_at TIME NULL,
  closes_at TIME NULL,
  crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE,
  time_zone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT operations_branch_working_hours_scope_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT operations_branch_working_hours_unique UNIQUE (tenant_id, company_id, branch_id, weekday),
  CONSTRAINT operations_branch_working_hours_open_interval_chk CHECK (
    (is_closed = TRUE AND opens_at IS NULL AND closes_at IS NULL AND crosses_midnight = FALSE)
    OR
    (is_closed = FALSE AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND (
      (crosses_midnight = FALSE AND closes_at > opens_at)
      OR (crosses_midnight = TRUE AND closes_at <= opens_at)
    ))
  )
);

CREATE INDEX IF NOT EXISTS operations_branch_working_hours_scope_idx
  ON operations_branch_working_hours (tenant_id, company_id, branch_id, weekday);

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
