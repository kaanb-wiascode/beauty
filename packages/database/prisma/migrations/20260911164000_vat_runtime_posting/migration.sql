CREATE OR REPLACE FUNCTION resolve_company_tax_settings(p_tenant_id TEXT, p_company_id TEXT)
RETURNS TABLE(sales_rate NUMERIC, purchase_rate NUMERIC, include_vat BOOLEAN)
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(sales_vat_rate,0),COALESCE(purchase_vat_rate,0),COALESCE(prices_include_vat,TRUE)
  FROM company_tax_settings
  WHERE tenant_id=p_tenant_id AND company_id=p_company_id
  UNION ALL
  SELECT 0::numeric,0::numeric,TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM company_tax_settings WHERE tenant_id=p_tenant_id AND company_id=p_company_id
  )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION snapshot_sale_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_company_id TEXT;
  v_rate NUMERIC(5,2) := 0;
  v_include BOOLEAN := TRUE;
  v_base NUMERIC(12,2);
BEGIN
  SELECT b.company_id INTO v_company_id FROM branches b WHERE b.id=NEW."branchId";
  SELECT sales_rate,include_vat INTO v_rate,v_include
  FROM resolve_company_tax_settings(NEW."tenantId",v_company_id);

  v_base := NEW.total;
  NEW.vat_rate := v_rate;
  NEW.prices_include_vat := v_include;
  IF v_rate = 0 THEN
    NEW.net_total := v_base;
    NEW.vat_total := 0;
  ELSIF v_include THEN
    NEW.net_total := ROUND(v_base / (1 + v_rate / 100),2);
    NEW.vat_total := ROUND(v_base - NEW.net_total,2);
  ELSE
    NEW.net_total := v_base;
    NEW.vat_total := ROUND(v_base * v_rate / 100,2);
    NEW.total := ROUND(v_base + NEW.vat_total,2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_sale_vat ON sales;
CREATE TRIGGER trg_snapshot_sale_vat
BEFORE INSERT OR UPDATE OF total ON sales
FOR EACH ROW EXECUTE FUNCTION snapshot_sale_vat();

CREATE OR REPLACE FUNCTION snapshot_sale_item_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id TEXT;
  v_company_id TEXT;
  v_rate NUMERIC(5,2) := 0;
  v_include BOOLEAN := TRUE;
  v_base NUMERIC(12,2);
BEGIN
  SELECT s."tenantId",b.company_id INTO v_tenant_id,v_company_id
  FROM sales s JOIN branches b ON b.id=s."branchId" WHERE s.id=NEW."saleId";
  SELECT sales_rate,include_vat INTO v_rate,v_include
  FROM resolve_company_tax_settings(v_tenant_id,v_company_id);
  v_base := NEW."lineTotal";
  NEW.vat_rate := v_rate;
  IF v_rate = 0 THEN
    NEW.net_amount := v_base;
    NEW.vat_amount := 0;
  ELSIF v_include THEN
    NEW.net_amount := ROUND(v_base / (1 + v_rate / 100),2);
    NEW.vat_amount := ROUND(v_base - NEW.net_amount,2);
  ELSE
    NEW.net_amount := v_base;
    NEW.vat_amount := ROUND(v_base * v_rate / 100,2);
    NEW."lineTotal" := ROUND(v_base + NEW.vat_amount,2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_sale_item_vat ON sale_items;
CREATE TRIGGER trg_snapshot_sale_item_vat
BEFORE INSERT OR UPDATE OF "lineTotal" ON sale_items
FOR EACH ROW EXECUTE FUNCTION snapshot_sale_item_vat();

CREATE OR REPLACE FUNCTION snapshot_supplier_bill_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_rate NUMERIC(5,2) := 0;
  v_include BOOLEAN := TRUE;
  v_base NUMERIC(12,2);
BEGIN
  SELECT purchase_rate,include_vat INTO v_rate,v_include
  FROM resolve_company_tax_settings(NEW.tenant_id,NEW.company_id);
  v_base := NEW.amount;
  NEW.vat_rate := v_rate;
  NEW.prices_include_vat := v_include;
  IF v_rate = 0 THEN
    NEW.net_amount := v_base;
    NEW.vat_amount := 0;
  ELSIF v_include THEN
    NEW.net_amount := ROUND(v_base / (1 + v_rate / 100),2);
    NEW.vat_amount := ROUND(v_base - NEW.net_amount,2);
  ELSE
    NEW.net_amount := v_base;
    NEW.vat_amount := ROUND(v_base * v_rate / 100,2);
    NEW.amount := ROUND(v_base + NEW.vat_amount,2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_supplier_bill_vat ON supplier_bills;
CREATE TRIGGER trg_snapshot_supplier_bill_vat
BEFORE INSERT OR UPDATE OF amount ON supplier_bills
FOR EACH ROW EXECUTE FUNCTION snapshot_supplier_bill_vat();

CREATE OR REPLACE FUNCTION propagate_goods_receipt_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_type='GOODS_RECEIPT' AND NEW.source_id IS NOT NULL THEN
    UPDATE inventory_goods_receipts
    SET net_total=NEW.net_amount,vat_total=NEW.vat_amount,vat_rate=NEW.vat_rate,
        prices_include_vat=NEW.prices_include_vat
    WHERE id=NEW.source_id AND tenant_id=NEW.tenant_id AND company_id=NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_goods_receipt_vat ON supplier_bills;
CREATE TRIGGER trg_propagate_goods_receipt_vat
AFTER INSERT OR UPDATE OF amount ON supplier_bills
FOR EACH ROW EXECUTE FUNCTION propagate_goods_receipt_vat();

CREATE OR REPLACE FUNCTION ensure_tax_account(
  p_tenant_id TEXT,p_company_id TEXT,p_code TEXT,p_name TEXT,p_type "AccountType"
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_id TEXT;
BEGIN
  SELECT id INTO v_id FROM chart_of_accounts WHERE "companyId"=p_company_id AND code=p_code LIMIT 1;
  IF v_id IS NULL THEN
    v_id := md5(random()::text || clock_timestamp()::text || p_code || p_company_id);
    INSERT INTO chart_of_accounts(id,"tenantId","companyId",code,name,type,active,"updatedAt")
    VALUES(v_id,p_tenant_id,p_company_id,p_code,p_name,p_type,TRUE,NOW())
    ON CONFLICT("companyId",code) DO UPDATE SET active=TRUE,"updatedAt"=NOW()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION split_vat_journal_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ref_type TEXT;
  v_ref_id TEXT;
  v_tenant_id TEXT;
  v_company_id TEXT;
  v_net NUMERIC(12,2);
  v_vat NUMERIC(12,2);
  v_gross NUMERIC(12,2);
  v_main_line_id TEXT;
  v_tax_account_id TEXT;
BEGIN
  SELECT "referenceType","referenceId","tenantId","companyId"
  INTO v_ref_type,v_ref_id,v_tenant_id,v_company_id
  FROM journal_entries WHERE id=NEW."journalEntryId";

  IF v_ref_type='SALE' THEN
    SELECT net_total,vat_total,total INTO v_net,v_vat,v_gross FROM sales WHERE id=v_ref_id;
    IF COALESCE(v_vat,0)<=0 THEN RETURN NEW; END IF;
    SELECT jel.id INTO v_main_line_id
    FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id=jel."accountId"
    WHERE jel."journalEntryId"=NEW."journalEntryId" AND coa.code='600' LIMIT 1;
    IF v_main_line_id IS NULL THEN RETURN NEW; END IF;
    UPDATE journal_entry_lines SET credit=v_net WHERE id=v_main_line_id AND credit<>v_net;
    v_tax_account_id := ensure_tax_account(v_tenant_id,v_company_id,'391','Hesaplanan KDV','LIABILITY');
    IF NOT EXISTS (
      SELECT 1 FROM journal_entry_lines jel WHERE jel."journalEntryId"=NEW."journalEntryId" AND jel."accountId"=v_tax_account_id
    ) THEN
      INSERT INTO journal_entry_lines(id,"journalEntryId","accountId",debit,credit,memo)
      VALUES(md5(random()::text||clock_timestamp()::text),NEW."journalEntryId",v_tax_account_id,0,v_vat,'Hesaplanan KDV');
    END IF;

  ELSIF v_ref_type='GOODS_RECEIPT' THEN
    SELECT net_total,vat_total,net_total+vat_total INTO v_net,v_vat,v_gross
    FROM inventory_goods_receipts WHERE id=v_ref_id;
    IF COALESCE(v_vat,0)<=0 THEN RETURN NEW; END IF;
    SELECT jel.id INTO v_main_line_id
    FROM journal_entry_lines jel JOIN chart_of_accounts coa ON coa.id=jel."accountId"
    WHERE jel."journalEntryId"=NEW."journalEntryId" AND coa.code='150' LIMIT 1;
    IF v_main_line_id IS NULL THEN RETURN NEW; END IF;
    UPDATE journal_entry_lines SET debit=v_net WHERE id=v_main_line_id AND debit<>v_net;
    UPDATE journal_entry_lines jel SET credit=v_gross
    FROM chart_of_accounts coa
    WHERE jel."journalEntryId"=NEW."journalEntryId" AND jel."accountId"=coa.id AND coa.code='320' AND jel.credit<>v_gross;
    v_tax_account_id := ensure_tax_account(v_tenant_id,v_company_id,'191','İndirilecek KDV','ASSET');
    IF NOT EXISTS (
      SELECT 1 FROM journal_entry_lines jel WHERE jel."journalEntryId"=NEW."journalEntryId" AND jel."accountId"=v_tax_account_id
    ) THEN
      INSERT INTO journal_entry_lines(id,"journalEntryId","accountId",debit,credit,memo)
      VALUES(md5(random()::text||clock_timestamp()::text),NEW."journalEntryId",v_tax_account_id,v_vat,0,'İndirilecek KDV');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_split_vat_journal_line ON journal_entry_lines;
CREATE TRIGGER trg_split_vat_journal_line
AFTER INSERT ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION split_vat_journal_line();
