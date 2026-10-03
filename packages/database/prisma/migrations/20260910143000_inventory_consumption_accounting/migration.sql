CREATE OR REPLACE FUNCTION accounting_post_inventory_consumption()
RETURNS TRIGGER AS $$
DECLARE
  inventory_account_id TEXT;
  cost_account_id TEXT;
  branch_id_value TEXT;
  movement_cost NUMERIC(12,2);
  journal_id TEXT;
BEGIN
  IF NEW.type <> 'SERVICE_CONSUMPTION' THEN
    RETURN NEW;
  END IF;

  SELECT w.branch_id, ROUND((NEW.quantity * s.cost_per_unit)::numeric, 2)
    INTO branch_id_value, movement_cost
  FROM inventory_stock s
  JOIN inventory_warehouses w ON w.id = NEW.warehouse_id
  WHERE s.product_id = NEW.product_id
    AND s.warehouse_id = NEW.warehouse_id
  LIMIT 1;

  IF movement_cost IS NULL OR movement_cost <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO chart_of_accounts(id,"tenantId","companyId",code,name,type,active,"createdAt","updatedAt")
  VALUES(gen_random_uuid()::text,NEW.tenant_id,NEW.company_id,'150','İlk Madde ve Malzeme','ASSET',true,NOW(),NOW())
  ON CONFLICT ("companyId",code) DO UPDATE SET active=true,"updatedAt"=NOW()
  RETURNING id INTO inventory_account_id;

  INSERT INTO chart_of_accounts(id,"tenantId","companyId",code,name,type,active,"createdAt","updatedAt")
  VALUES(gen_random_uuid()::text,NEW.tenant_id,NEW.company_id,'740','Hizmet Üretim Maliyeti','EXPENSE',true,NOW(),NOW())
  ON CONFLICT ("companyId",code) DO UPDATE SET active=true,"updatedAt"=NOW()
  RETURNING id INTO cost_account_id;

  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE "companyId"=NEW.company_id
      AND "referenceType"='INVENTORY_CONSUMPTION'
      AND "referenceId"=NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  journal_id := gen_random_uuid()::text;

  INSERT INTO journal_entries(
    id,"tenantId","companyId","branchId",number,status,"entryDate",description,
    "referenceType","referenceId","postedAt","createdAt","updatedAt"
  ) VALUES(
    journal_id,
    NEW.tenant_id,
    NEW.company_id,
    branch_id_value,
    'JE-' || TO_CHAR(NOW(),'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text,'-','') FROM 1 FOR 8)),
    'POSTED',
    NOW(),
    'Hizmet stok tüketimi ' || NEW.id,
    'INVENTORY_CONSUMPTION',
    NEW.id,
    NOW(),
    NOW(),
    NOW()
  );

  INSERT INTO journal_entry_lines(id,"journalEntryId","accountId",debit,credit,memo,"createdAt")
  VALUES
    (gen_random_uuid()::text,journal_id,cost_account_id,movement_cost,0,'Hizmet malzeme maliyeti',NOW()),
    (gen_random_uuid()::text,journal_id,inventory_account_id,0,movement_cost,'Stoktan tüketilen malzeme',NOW());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounting_inventory_consumption ON inventory_movements;
CREATE TRIGGER accounting_inventory_consumption
AFTER INSERT ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION accounting_post_inventory_consumption();
