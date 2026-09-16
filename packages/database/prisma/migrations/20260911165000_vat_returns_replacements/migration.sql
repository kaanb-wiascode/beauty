-- Preserve historical VAT snapshots through procurement return/replacement flows.

ALTER TABLE inventory_purchase_returns
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prices_include_vat BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE inventory_purchase_replacement_requests
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prices_include_vat BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE supplier_credit_notes
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE inventory_purchase_returns
  ADD CONSTRAINT purchase_returns_vat_nonnegative_chk
  CHECK (net_amount >= 0 AND vat_amount >= 0 AND vat_rate >= 0 AND vat_rate <= 100) NOT VALID;

ALTER TABLE inventory_purchase_replacement_requests
  ADD CONSTRAINT purchase_replacements_vat_nonnegative_chk
  CHECK (net_amount >= 0 AND vat_amount >= 0 AND vat_rate >= 0 AND vat_rate <= 100) NOT VALID;

-- Supplier bill tax identity is a document snapshot. Do not recalculate it from
-- current company settings merely because a return/replacement changes amount.
DROP TRIGGER IF EXISTS trg_snapshot_supplier_bill_vat ON supplier_bills;
CREATE TRIGGER trg_snapshot_supplier_bill_vat
BEFORE INSERT ON supplier_bills
FOR EACH ROW EXECUTE FUNCTION snapshot_supplier_bill_vat();

CREATE OR REPLACE FUNCTION snapshot_purchase_return_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_receipt_net NUMERIC(12,2);
  v_receipt_vat NUMERIC(12,2);
  v_receipt_gross NUMERIC(12,2);
BEGIN
  SELECT net_total,vat_total,(net_total+vat_total),vat_rate,prices_include_vat
  INTO v_receipt_net,v_receipt_vat,v_receipt_gross,NEW.vat_rate,NEW.prices_include_vat
  FROM inventory_goods_receipts
  WHERE id=NEW.goods_receipt_id AND tenant_id=NEW.tenant_id AND company_id=NEW.company_id;

  IF COALESCE(v_receipt_gross,0) <= 0 OR COALESCE(NEW.vat_rate,0)=0 THEN
    NEW.net_amount := NEW.total_amount;
    NEW.vat_amount := 0;
  ELSIF NEW.prices_include_vat THEN
    NEW.net_amount := ROUND(NEW.total_amount / (1 + NEW.vat_rate / 100),2);
    NEW.vat_amount := ROUND(NEW.total_amount - NEW.net_amount,2);
  ELSE
    -- For VAT-exclusive purchase prices total_amount is the net return base.
    NEW.net_amount := NEW.total_amount;
    NEW.vat_amount := ROUND(NEW.total_amount * NEW.vat_rate / 100,2);
    NEW.total_amount := ROUND(NEW.net_amount + NEW.vat_amount,2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_purchase_return_vat ON inventory_purchase_returns;
CREATE TRIGGER trg_snapshot_purchase_return_vat
BEFORE INSERT ON inventory_purchase_returns
FOR EACH ROW EXECUTE FUNCTION snapshot_purchase_return_vat();

CREATE OR REPLACE FUNCTION propagate_purchase_return_credit_note_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  SELECT net_amount,vat_amount,vat_rate INTO r
  FROM inventory_purchase_returns WHERE id=NEW.purchase_return_id;
  IF FOUND THEN
    NEW.net_amount := r.net_amount;
    NEW.vat_amount := r.vat_amount;
    NEW.vat_rate := r.vat_rate;
    NEW.amount := ROUND(r.net_amount+r.vat_amount,2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_return_credit_note_vat ON supplier_credit_notes;
CREATE TRIGGER trg_purchase_return_credit_note_vat
BEFORE INSERT ON supplier_credit_notes
FOR EACH ROW EXECUTE FUNCTION propagate_purchase_return_credit_note_vat();

CREATE OR REPLACE FUNCTION snapshot_purchase_replacement_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r RECORD;
DECLARE v_item_net NUMERIC(12,2);
BEGIN
  SELECT vat_rate,prices_include_vat INTO r
  FROM inventory_purchase_returns
  WHERE id=NEW.purchase_return_id AND tenant_id=NEW.tenant_id AND company_id=NEW.company_id;
  NEW.vat_rate := COALESCE(r.vat_rate,0);
  NEW.prices_include_vat := COALESCE(r.prices_include_vat,TRUE);
  -- Amount is finalized at receipt time by the application service; keep zero-safe defaults here.
  NEW.net_amount := COALESCE(NEW.net_amount,0);
  NEW.vat_amount := COALESCE(NEW.vat_amount,0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_purchase_replacement_vat ON inventory_purchase_replacement_requests;
CREATE TRIGGER trg_snapshot_purchase_replacement_vat
BEFORE INSERT ON inventory_purchase_replacement_requests
FOR EACH ROW EXECUTE FUNCTION snapshot_purchase_replacement_vat();

CREATE OR REPLACE FUNCTION split_procurement_return_replacement_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ref_type TEXT;
  v_ref_id TEXT;
  v_tenant_id TEXT;
  v_company_id TEXT;
  v_net NUMERIC(12,2);
  v_vat NUMERIC(12,2);
  v_gross NUMERIC(12,2);
  v_inventory_line_id TEXT;
  v_payable_line_id TEXT;
  v_tax_account_id TEXT;
BEGIN
  SELECT "referenceType","referenceId","tenantId","companyId"
  INTO v_ref_type,v_ref_id,v_tenant_id,v_company_id
  FROM journal_entries WHERE id=NEW."journalEntryId";

  IF v_ref_type='PURCHASE_RETURN' THEN
    SELECT net_amount,vat_amount,(net_amount+vat_amount)
    INTO v_net,v_vat,v_gross FROM inventory_purchase_returns WHERE id=v_ref_id;
    IF COALESCE(v_vat,0)<=0 THEN RETURN NEW; END IF;

    SELECT jel.id INTO v_inventory_line_id
    FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id=jel."accountId"
    WHERE jel."journalEntryId"=NEW."journalEntryId" AND coa.code='150' LIMIT 1;
    SELECT jel.id INTO v_payable_line_id
    FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id=jel."accountId"
    WHERE jel."journalEntryId"=NEW."journalEntryId" AND coa.code='320' LIMIT 1;
    IF v_inventory_line_id IS NULL OR v_payable_line_id IS NULL THEN RETURN NEW; END IF;

    UPDATE journal_entry_lines SET credit=v_net WHERE id=v_inventory_line_id AND credit<>v_net;
    UPDATE journal_entry_lines SET debit=v_gross WHERE id=v_payable_line_id AND debit<>v_gross;
    v_tax_account_id := ensure_tax_account(v_tenant_id,v_company_id,'191','İndirilecek KDV','ASSET');
    IF NOT EXISTS (
      SELECT 1 FROM journal_entry_lines WHERE "journalEntryId"=NEW."journalEntryId" AND "accountId"=v_tax_account_id
    ) THEN
      INSERT INTO journal_entry_lines(id,"journalEntryId","accountId",debit,credit,memo)
      VALUES(md5(random()::text||clock_timestamp()::text),NEW."journalEntryId",v_tax_account_id,0,v_vat,'İndirilecek KDV iadesi');
    END IF;

  ELSIF v_ref_type='PURCHASE_REPLACEMENT' THEN
    SELECT net_amount,vat_amount,(net_amount+vat_amount)
    INTO v_net,v_vat,v_gross FROM inventory_purchase_replacement_requests WHERE id=v_ref_id;
    IF COALESCE(v_vat,0)<=0 THEN RETURN NEW; END IF;

    SELECT jel.id INTO v_inventory_line_id
    FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id=jel."accountId"
    WHERE jel."journalEntryId"=NEW."journalEntryId" AND coa.code='150' LIMIT 1;
    SELECT jel.id INTO v_payable_line_id
    FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id=jel."accountId"
    WHERE jel."journalEntryId"=NEW."journalEntryId" AND coa.code='320' LIMIT 1;
    IF v_inventory_line_id IS NULL OR v_payable_line_id IS NULL THEN RETURN NEW; END IF;

    UPDATE journal_entry_lines SET debit=v_net WHERE id=v_inventory_line_id AND debit<>v_net;
    UPDATE journal_entry_lines SET credit=v_gross WHERE id=v_payable_line_id AND credit<>v_gross;
    v_tax_account_id := ensure_tax_account(v_tenant_id,v_company_id,'191','İndirilecek KDV','ASSET');
    IF NOT EXISTS (
      SELECT 1 FROM journal_entry_lines WHERE "journalEntryId"=NEW."journalEntryId" AND "accountId"=v_tax_account_id
    ) THEN
      INSERT INTO journal_entry_lines(id,"journalEntryId","accountId",debit,credit,memo)
      VALUES(md5(random()::text||clock_timestamp()::text),NEW."journalEntryId",v_tax_account_id,v_vat,0,'Replacement indirilecek KDV');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_split_procurement_return_replacement_vat ON journal_entry_lines;
CREATE TRIGGER trg_split_procurement_return_replacement_vat
AFTER INSERT ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION split_procurement_return_replacement_vat();
