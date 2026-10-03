CREATE OR REPLACE FUNCTION guard_allocated_expense_payment_reversal()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM financial_obligation_payment_allocations a
    WHERE a.expense_payment_id=NEW.expense_payment_id
      AND a.reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Expense payment cannot be reversed while active obligation allocations exist';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_allocated_expense_payment_reversal
BEFORE INSERT ON expense_payment_reversals
FOR EACH ROW EXECUTE FUNCTION guard_allocated_expense_payment_reversal();
