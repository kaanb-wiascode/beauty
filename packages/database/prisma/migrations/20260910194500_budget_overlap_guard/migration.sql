CREATE OR REPLACE FUNCTION prevent_overlapping_budgets()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM budgets b
    WHERE b.company_id = NEW.company_id
      AND b.target_type = NEW.target_type
      AND b.target_id = NEW.target_id
      AND b.metric_type = NEW.metric_type
      AND b.id <> NEW.id
      AND b.period_start <= NEW.period_end
      AND b.period_end >= NEW.period_start
      AND NOT (
        b.period_start = NEW.period_start
        AND b.period_end = NEW.period_end
      )
  ) THEN
    RAISE EXCEPTION 'Budget period overlaps an existing budget for the same target and metric';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS budgets_prevent_overlap ON budgets;

CREATE TRIGGER budgets_prevent_overlap
BEFORE INSERT OR UPDATE ON budgets
FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_budgets();
