ALTER TABLE staff_development_plan_items
  ADD COLUMN IF NOT EXISTS training_assignment_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS program_assignment_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_development_plan_items_training_assignment_uidx
  ON staff_development_plan_items(training_assignment_id)
  WHERE training_assignment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_development_plan_items_program_assignment_uidx
  ON staff_development_plan_items(program_assignment_id)
  WHERE program_assignment_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='staff_development_plan_items_training_assignment_fk'
  ) THEN
    ALTER TABLE staff_development_plan_items
      ADD CONSTRAINT staff_development_plan_items_training_assignment_fk
      FOREIGN KEY (training_assignment_id) REFERENCES training_assignments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='staff_development_plan_items_program_assignment_fk'
  ) THEN
    ALTER TABLE staff_development_plan_items
      ADD CONSTRAINT staff_development_plan_items_program_assignment_fk
      FOREIGN KEY (program_assignment_id) REFERENCES training_program_assignments(id) ON DELETE SET NULL;
  END IF;
END $$;
