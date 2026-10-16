-- Guard approved expense cancellation at the aggregate boundary.
-- Payment and accounting reversals must complete before cancellation so that
-- expense master state cannot diverge from posted financial records.
CREATE OR REPLACE FUNCTION enforce_expense_cancellation_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.approval_status = 'APPROVED'::"FinanceApprovalStatus"
     AND NEW.approval_status = 'CANCELLED'::"FinanceApprovalStatus" THEN

    IF NEW.payment_status <> 'UNPAID'::"FinancePaymentStatus" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Expense payments must be fully reversed before cancellation.';
    END IF;

    IF NEW.accounting_status = 'POSTED'::"FinanceAccountingStatus" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Expense accounting must be reversed before cancellation.';
    END IF;

    -- READY_TO_POST has no posted journal yet. Cancellation safely collapses
    -- this transient state back to UNPOSTED so the cancelled aggregate cannot
    -- remain eligible for posting.
    IF NEW.accounting_status = 'READY_TO_POST'::"FinanceAccountingStatus" THEN
      NEW.accounting_status := 'UNPOSTED'::"FinanceAccountingStatus";
    END IF;

    IF NEW.accounting_status NOT IN (
      'UNPOSTED'::"FinanceAccountingStatus",
      'REVERSED'::"FinanceAccountingStatus"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'Expense accounting state is not cancellation-safe.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_cancellation_integrity ON expenses;
CREATE TRIGGER trg_expense_cancellation_integrity
BEFORE UPDATE OF approval_status ON expenses
FOR EACH ROW
EXECUTE FUNCTION enforce_expense_cancellation_integrity();
