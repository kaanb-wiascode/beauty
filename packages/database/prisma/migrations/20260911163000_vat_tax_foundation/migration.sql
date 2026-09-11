CREATE TABLE IF NOT EXISTS company_tax_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  purchase_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  prices_include_vat BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_tax_settings_sales_rate_chk CHECK (sales_vat_rate >= 0 AND sales_vat_rate <= 100) NOT VALID,
  CONSTRAINT company_tax_settings_purchase_rate_chk CHECK (purchase_vat_rate >= 0 AND purchase_vat_rate <= 100) NOT VALID
);

CREATE INDEX IF NOT EXISTS company_tax_settings_tenant_idx ON company_tax_settings(tenant_id, company_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS net_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS vat_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS prices_include_vat BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE inventory_goods_receipts ADD COLUMN IF NOT EXISTS net_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_goods_receipts ADD COLUMN IF NOT EXISTS vat_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_goods_receipts ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_goods_receipts ADD COLUMN IF NOT EXISTS prices_include_vat BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE inventory_goods_receipt_items ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_goods_receipt_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventory_goods_receipt_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS prices_include_vat BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sales ADD CONSTRAINT sales_vat_nonnegative_chk CHECK (net_total >= 0 AND vat_total >= 0 AND vat_rate >= 0 AND vat_rate <= 100) NOT VALID;
ALTER TABLE inventory_goods_receipts ADD CONSTRAINT goods_receipts_vat_nonnegative_chk CHECK (net_total >= 0 AND vat_total >= 0 AND vat_rate >= 0 AND vat_rate <= 100) NOT VALID;
ALTER TABLE supplier_bills ADD CONSTRAINT supplier_bills_vat_nonnegative_chk CHECK (net_amount >= 0 AND vat_amount >= 0 AND vat_rate >= 0 AND vat_rate <= 100) NOT VALID;
