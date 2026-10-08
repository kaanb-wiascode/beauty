CREATE OR REPLACE FUNCTION snapshot_sale_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_company_id TEXT;
  v_rate NUMERIC(5,2) := 0;
  v_include BOOLEAN := TRUE;
  v_base NUMERIC(12,2);
BEGIN
  SELECT b."companyId" INTO v_company_id
  FROM branches b
  WHERE b.id=NEW."branchId";

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

CREATE OR REPLACE FUNCTION snapshot_sale_item_vat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id TEXT;
  v_company_id TEXT;
  v_rate NUMERIC(5,2) := 0;
  v_include BOOLEAN := TRUE;
  v_base NUMERIC(12,2);
BEGIN
  SELECT s."tenantId",b."companyId" INTO v_tenant_id,v_company_id
  FROM sales s
  JOIN branches b ON b.id=s."branchId"
  WHERE s.id=NEW."saleId";

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
