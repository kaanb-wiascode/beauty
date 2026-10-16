ALTER TABLE staff_development_plan_items
  ADD COLUMN IF NOT EXISTS activity_title TEXT,
  ADD COLUMN IF NOT EXISTS activity_description TEXT,
  ADD COLUMN IF NOT EXISTS facilitator_staff_id TEXT;

DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'staff_development_plan_items'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%item_type%'
  LOOP
    EXECUTE format('ALTER TABLE staff_development_plan_items DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE staff_development_plan_items
  ADD CONSTRAINT staff_development_plan_items_item_type_check
  CHECK (item_type IN (
    'COMPETENCY',
    'COURSE',
    'PROGRAM',
    'ACTION',
    'COACHING',
    'MENTORING',
    'PROJECT',
    'STRETCH_ASSIGNMENT'
  ));

ALTER TABLE staff_development_plan_items
  ADD CONSTRAINT staff_development_plan_items_facilitator_staff_fk
  FOREIGN KEY (facilitator_staff_id) REFERENCES staff(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS staff_development_plan_items_facilitator_idx
  ON staff_development_plan_items(tenant_id, company_id, facilitator_staff_id)
  WHERE facilitator_staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_staff_development_plan_item_scope()
RETURNS trigger AS $$
DECLARE
  plan_branch_id TEXT;
  facilitator_branch_id TEXT;
BEGIN
  SELECT branch_id INTO plan_branch_id
  FROM staff_development_plans
  WHERE id = NEW.plan_id
    AND tenant_id = NEW.tenant_id
    AND company_id = NEW.company_id;

  IF plan_branch_id IS NULL THEN
    RAISE EXCEPTION 'Development plan item is outside plan scope';
  END IF;

  IF NEW.facilitator_staff_id IS NOT NULL THEN
    SELECT s."branchId" INTO facilitator_branch_id
    FROM staff s
    JOIN branches b ON b.id = s."branchId"
    WHERE s.id = NEW.facilitator_staff_id
      AND s."tenantId" = NEW.tenant_id
      AND b."companyId" = NEW.company_id
      AND s.status = 'ACTIVE';

    IF facilitator_branch_id IS NULL THEN
      RAISE EXCEPTION 'Development activity facilitator is outside tenant/company scope';
    END IF;
  END IF;

  IF NEW.item_type IN ('COACHING','MENTORING','PROJECT','STRETCH_ASSIGNMENT')
     AND NULLIF(BTRIM(NEW.activity_title), '') IS NULL THEN
    RAISE EXCEPTION 'Development activity title is required';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_development_plan_item_scope_trg ON staff_development_plan_items;
CREATE TRIGGER staff_development_plan_item_scope_trg
BEFORE INSERT OR UPDATE ON staff_development_plan_items
FOR EACH ROW EXECUTE FUNCTION enforce_staff_development_plan_item_scope();