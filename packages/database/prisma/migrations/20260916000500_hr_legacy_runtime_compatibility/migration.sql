-- Compatibility hardening for legacy HR endpoints while normalized engines remain authoritative.
BEGIN;

-- Legacy attendance upsert targets tenant/staff/work_date. The original schema only
-- guaranteed staff/work_date, which cannot satisfy that ON CONFLICT target.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_tenant_staff_work_date_key
  ON attendance_records(tenant_id, staff_id, work_date);

-- Legacy leave endpoints historically used leave_type while the original table used
-- type. Keep both representations synchronized during the migration period so older
-- API clients cannot fail at runtime while the normalized leave policy engine uses
-- leave_type_id.
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_type TEXT;
UPDATE leave_requests
SET leave_type = COALESCE(NULLIF(leave_type, ''), type, 'ANNUAL')
WHERE leave_type IS NULL OR leave_type = '';
ALTER TABLE leave_requests ALTER COLUMN leave_type SET DEFAULT 'ANNUAL';
ALTER TABLE leave_requests ALTER COLUMN leave_type SET NOT NULL;

CREATE OR REPLACE FUNCTION hr_sync_legacy_leave_type() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.leave_type := COALESCE(NULLIF(NEW.leave_type, ''), NULLIF(NEW.type, ''), 'ANNUAL');
    NEW.type := NEW.leave_type;
  ELSE
    IF NEW.leave_type IS DISTINCT FROM OLD.leave_type THEN
      NEW.type := COALESCE(NULLIF(NEW.leave_type, ''), OLD.type, 'ANNUAL');
      NEW.leave_type := NEW.type;
    ELSIF NEW.type IS DISTINCT FROM OLD.type THEN
      NEW.leave_type := COALESCE(NULLIF(NEW.type, ''), OLD.leave_type, 'ANNUAL');
      NEW.type := NEW.leave_type;
    ELSE
      NEW.leave_type := COALESCE(NULLIF(NEW.leave_type, ''), NULLIF(NEW.type, ''), 'ANNUAL');
      NEW.type := NEW.leave_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leave_requests_legacy_type_sync ON leave_requests;
CREATE TRIGGER leave_requests_legacy_type_sync
BEFORE INSERT OR UPDATE OF type, leave_type ON leave_requests
FOR EACH ROW EXECUTE FUNCTION hr_sync_legacy_leave_type();

-- Normalize existing data once more after installing compatibility semantics.
UPDATE leave_requests SET type = leave_type WHERE type IS DISTINCT FROM leave_type;

COMMIT;
