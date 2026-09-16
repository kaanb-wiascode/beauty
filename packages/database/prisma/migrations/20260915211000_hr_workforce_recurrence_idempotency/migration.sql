ALTER TABLE hr_scheduled_shifts
  ADD COLUMN IF NOT EXISTS recurrence_rule_id TEXT NULL;

ALTER TABLE hr_scheduled_shifts
  ADD CONSTRAINT hr_scheduled_shifts_recurrence_rule_fk
  FOREIGN KEY (recurrence_rule_id) REFERENCES hr_shift_recurrence_rules(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hr_scheduled_shifts_recurrence_date_uq
  ON hr_scheduled_shifts(recurrence_rule_id, shift_date)
  WHERE recurrence_rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hr_scheduled_shifts_recurrence_rule_idx
  ON hr_scheduled_shifts(tenant_id, company_id, recurrence_rule_id, shift_date);

CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_recurrence_rules_scope_uq
  ON hr_shift_recurrence_rules(tenant_id, company_id, branch_id, template_id, weekday, effective_from)
  WHERE active = TRUE;
