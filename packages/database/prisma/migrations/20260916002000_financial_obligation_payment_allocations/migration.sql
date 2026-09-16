CREATE TABLE "financial_obligation_payment_allocations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "obligation_id" TEXT NOT NULL,
  "expense_payment_id" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "allocated_by" TEXT NOT NULL,
  "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversed_by" TEXT,
  "reversed_at" TIMESTAMP(3),
  "reversal_reason" TEXT,

  CONSTRAINT "financial_obligation_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_obligation_payment_allocations_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "financial_obligation_payment_allocations_reversal_check" CHECK (
    ("reversed_at" IS NULL AND "reversed_by" IS NULL AND "reversal_reason" IS NULL)
    OR
    ("reversed_at" IS NOT NULL AND "reversed_by" IS NOT NULL AND "reversal_reason" IS NOT NULL)
  )
);

CREATE INDEX "financial_obligation_payment_allocations_scope_idx"
  ON "financial_obligation_payment_allocations"("tenant_id", "company_id", "branch_id", "allocated_at");
CREATE INDEX "financial_obligation_payment_allocations_obligation_idx"
  ON "financial_obligation_payment_allocations"("obligation_id");
CREATE INDEX "financial_obligation_payment_allocations_payment_idx"
  ON "financial_obligation_payment_allocations"("expense_payment_id");

ALTER TABLE "financial_obligation_payment_allocations"
  ADD CONSTRAINT "financial_obligation_payment_allocations_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_obligation_payment_allocations"
  ADD CONSTRAINT "financial_obligation_payment_allocations_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_obligation_payment_allocations"
  ADD CONSTRAINT "financial_obligation_payment_allocations_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_obligation_payment_allocations"
  ADD CONSTRAINT "financial_obligation_payment_allocations_obligation_fkey"
  FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_obligation_payment_allocations"
  ADD CONSTRAINT "financial_obligation_payment_allocations_payment_fkey"
  FOREIGN KEY ("expense_payment_id") REFERENCES "expense_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_financial_obligation_payment_allocation()
RETURNS trigger AS $$
DECLARE
  obligation_amount numeric(14,2);
  obligation_currency varchar(3);
  obligation_status "FinancialObligationStatus";
  payment_amount numeric(14,2);
  payment_currency varchar(3);
  obligation_allocated numeric(14,2);
  payment_allocated numeric(14,2);
BEGIN
  SELECT o.amount,o.currency,o.status
    INTO obligation_amount,obligation_currency,obligation_status
  FROM financial_obligations o
  WHERE o.id=NEW.obligation_id
    AND o.tenant_id=NEW.tenant_id
    AND o.company_id=NEW.company_id
    AND (NEW.branch_id IS NULL OR o.branch_id=NEW.branch_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Financial obligation is outside allocation scope'; END IF;
  IF obligation_status NOT IN ('APPROVED','READY_FOR_PAYMENT','PARTIALLY_PAID','PAID') THEN
    RAISE EXCEPTION 'Financial obligation is not eligible for payment allocation';
  END IF;

  SELECT ep.amount,e.currency
    INTO payment_amount,payment_currency
  FROM expense_payments ep
  JOIN expenses e ON e.id=ep.expense_id
  LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=ep.id
  WHERE ep.id=NEW.expense_payment_id
    AND ep.tenant_id=NEW.tenant_id
    AND ep.company_id=NEW.company_id
    AND (NEW.branch_id IS NULL OR ep.branch_id=NEW.branch_id)
    AND r.id IS NULL
  FOR UPDATE OF ep;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active expense payment is outside allocation scope'; END IF;
  IF payment_currency<>obligation_currency THEN RAISE EXCEPTION 'Obligation and payment currencies do not match'; END IF;

  SELECT COALESCE(SUM(a.amount),0) INTO obligation_allocated
  FROM financial_obligation_payment_allocations a
  WHERE a.obligation_id=NEW.obligation_id AND a.reversed_at IS NULL;
  IF obligation_allocated + NEW.amount > obligation_amount + 0.005 THEN
    RAISE EXCEPTION 'Financial obligation payment allocation exceeds obligation amount';
  END IF;

  SELECT COALESCE(SUM(a.amount),0) INTO payment_allocated
  FROM financial_obligation_payment_allocations a
  WHERE a.expense_payment_id=NEW.expense_payment_id AND a.reversed_at IS NULL;
  IF payment_allocated + NEW.amount > payment_amount + 0.005 THEN
    RAISE EXCEPTION 'Financial obligation payment allocation exceeds expense payment amount';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_financial_obligation_payment_allocation_guard
BEFORE INSERT ON "financial_obligation_payment_allocations"
FOR EACH ROW EXECUTE FUNCTION enforce_financial_obligation_payment_allocation();
