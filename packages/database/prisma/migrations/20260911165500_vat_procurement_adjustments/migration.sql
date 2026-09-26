ALTER TABLE inventory_purchase_returns
  ADD COLUMN IF NOT EXISTS tax_adjusted_at TIMESTAMPTZ;
ALTER TABLE inventory_purchase_replacement_requests
  ADD COLUMN IF NOT EXISTS tax_adjusted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION reconcile_procurement_tax_document(p_ref_type TEXT,p_ref_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_raw NUMERIC(12,2);
  v_net NUMERIC(12,2);
  v_vat NUMERIC(12,2);
  v_gross NUMERIC(12,2);
BEGIN
  IF p_ref_type='PURCHASE_RETURN' THEN
    SELECT * INTO r FROM inventory_purchase_returns WHERE id=p_ref_id FOR UPDATE;
    IF NOT FOUND OR r.tax_adjusted_at IS NOT NULL THEN RETURN; END IF;

    v_net := r.net_amount;
    v_vat := r.vat_amount;
    v_gross := ROUND(v_net+v_vat,2);

    UPDATE supplier_bills
    SET amount = CASE WHEN r.prices_include_vat THEN amount ELSE amount-v_vat END,
        net_amount=GREATEST(net_amount-v_net,0),
        vat_amount=GREATEST(vat_amount-v_vat,0),
        updated_at=NOW()
    WHERE id=r.supplier_bill_id AND tenant_id=r.tenant_id AND company_id=r.company_id;

    UPDATE inventory_purchase_returns SET tax_adjusted_at=NOW() WHERE id=r.id;

  ELSIF p_ref_type='PURCHASE_REPLACEMENT' THEN
    SELECT * INTO r FROM inventory_purchase_replacement_requests WHERE id=p_ref_id FOR UPDATE;
    IF NOT FOUND OR r.tax_adjusted_at IS NOT NULL THEN RETURN; END IF;

    SELECT COALESCE(SUM(quantity*unit_cost),0)::numeric INTO v_raw
    FROM inventory_purchase_replacement_items WHERE replacement_request_id=r.id;

    IF COALESCE(r.vat_rate,0)=0 THEN
      v_net := ROUND(v_raw,2); v_vat := 0; v_gross := v_net;
    ELSIF r.prices_include_vat THEN
      v_gross := ROUND(v_raw,2);
      v_net := ROUND(v_gross/(1+r.vat_rate/100),2);
      v_vat := ROUND(v_gross-v_net,2);
    ELSE
      v_net := ROUND(v_raw,2);
      v_vat := ROUND(v_net*r.vat_rate/100,2);
      v_gross := ROUND(v_net+v_vat,2);
    END IF;

    UPDATE inventory_purchase_replacement_requests
    SET net_amount=v_net,vat_amount=v_vat,tax_adjusted_at=NOW(),updated_at=NOW()
    WHERE id=r.id;

    UPDATE supplier_bills
    SET amount = CASE WHEN r.prices_include_vat THEN amount ELSE amount+v_vat END,
        net_amount=net_amount+v_net,
        vat_amount=vat_amount+v_vat,
        updated_at=NOW()
    WHERE id=r.supplier_bill_id AND tenant_id=r.tenant_id AND company_id=r.company_id;
  END IF;
END;
$$;

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

  IF v_ref_type NOT IN ('PURCHASE_RETURN','PURCHASE_REPLACEMENT') THEN RETURN NEW; END IF;
  PERFORM reconcile_procurement_tax_document(v_ref_type,v_ref_id);

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
    IF NOT EXISTS (SELECT 1 FROM journal_entry_lines WHERE "journalEntryId"=NEW."journalEntryId" AND "accountId"=v_tax_account_id) THEN
      INSERT INTO journal_entry_lines(id,"journalEntryId","accountId",debit,credit,memo)
      VALUES(md5(random()::text||clock_timestamp()::text),NEW."journalEntryId",v_tax_account_id,0,v_vat,'İndirilecek KDV iadesi');
    END IF;
  ELSE
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
    IF NOT EXISTS (SELECT 1 FROM journal_entry_lines WHERE "journalEntryId"=NEW."journalEntryId" AND "accountId"=v_tax_account_id) THEN
      INSERT INTO journal_entry_lines(id,"journalEntryId","accountId",debit,credit,memo)
      VALUES(md5(random()::text||clock_timestamp()::text),NEW."journalEntryId",v_tax_account_id,v_vat,0,'Replacement indirilecek KDV');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
