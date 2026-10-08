-- Prevent cancellation from bypassing immutable payment/accounting reversal workflows.

CREATE OR REPLACE FUNCTION guard_expense_cancellation_integrity()
RETURNS trigger AS $$
BEGIN
  IF NEW.approval_status = 'CANCELLED'::"FinanceApprovalStatus"
     AND OLD.approval_status <> 'CANCELLED'::"FinanceApprovalStatus" THEN
    IF OLD.payment_status <> 'UNPAID'::"FinancePaymentStatus" THEN
      RAISE EXCEPTION 'Expense payments must be fully reversed before cancellation'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.accounting_status NOT IN (
      'UNPOSTED'::"FinanceAccountingStatus",
      'REVERSED'::"FinanceAccountingStatus"
    ) THEN
      RAISE EXCEPTION 'Expense accounting must be unposted or reversed before cancellation'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expenses_cancellation_integrity_guard ON expenses;
CREATE TRIGGER expenses_cancellation_integrity_guard
BEFORE UPDATE OF approval_status ON expenses
FOR EACH ROW
EXECUTE FUNCTION guard_expense_cancellation_integrity();
