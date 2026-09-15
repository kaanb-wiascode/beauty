CREATE TABLE operations_branch_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  weekday SMALLINT NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  opens_at TIME NULL,
  closes_at TIME NULL,
  crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE,
  time_zone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT operations_branch_working_hours_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT operations_branch_working_hours_interval_check CHECK (
    (is_closed = TRUE AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (is_closed = FALSE AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND (crosses_midnight = TRUE OR opens_at < closes_at))
  ),
  CONSTRAINT operations_branch_working_hours_scope_unique UNIQUE (tenant_id, company_id, branch_id, weekday),
  CONSTRAINT operations_branch_working_hours_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT operations_branch_working_hours_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE INDEX operations_branch_working_hours_scope_idx
  ON operations_branch_working_hours (tenant_id, company_id, branch_id, weekday);

CREATE OR REPLACE FUNCTION operations_branch_working_hours_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM branches b
    JOIN companies c ON c.id = b."companyId"
    WHERE b.id = NEW.branch_id
      AND c.id = NEW.company_id
      AND c."tenantId" = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'OPERATIONS_BRANCH_WORKING_HOURS_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operations_branch_working_hours_scope_guard_trigger
BEFORE INSERT OR UPDATE ON operations_branch_working_hours
FOR EACH ROW EXECUTE FUNCTION operations_branch_working_hours_scope_guard();
