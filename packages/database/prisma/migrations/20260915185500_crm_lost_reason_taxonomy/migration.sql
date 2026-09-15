-- CRM Phase 1 / 5.5: tenant-configurable structured lost reasons.

CREATE TABLE IF NOT EXISTS crm_lost_reasons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_lost_reasons_scope_code_key UNIQUE (tenant_id, company_id, code),
  CONSTRAINT crm_lost_reasons_code_check CHECK (code ~ '^[A-Z0-9_]{2,60}$'),
  CONSTRAINT crm_lost_reasons_label_check CHECK (length(btrim(label)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_crm_lost_reasons_active_scope
  ON crm_lost_reasons(tenant_id, company_id, is_active, sort_order, label);

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS lost_reason_id TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason_note TEXT;

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS lost_reason_id TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason_note TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_leads_lost_reason_scope
  ON crm_leads(tenant_id, company_id, lost_reason_id) WHERE lost_reason_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_lost_reason_scope
  ON crm_opportunities(tenant_id, company_id, lost_reason_id) WHERE lost_reason_id IS NOT NULL;

CREATE OR REPLACE FUNCTION crm_validate_lost_reason_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r crm_lost_reasons%ROWTYPE;
BEGIN
  IF NEW.lost_reason_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM crm_lost_reasons WHERE id=NEW.lost_reason_id;
  IF NOT FOUND OR r.tenant_id<>NEW.tenant_id OR r.company_id<>NEW.company_id THEN
    RAISE EXCEPTION 'crm lost reason scope mismatch';
  END IF;
  IF NOT r.is_active THEN RAISE EXCEPTION 'crm lost reason is inactive'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_lost_reason_scope_guard ON crm_leads;
CREATE TRIGGER crm_leads_lost_reason_scope_guard BEFORE INSERT OR UPDATE OF lost_reason_id ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_validate_lost_reason_scope();
DROP TRIGGER IF EXISTS crm_opportunities_lost_reason_scope_guard ON crm_opportunities;
CREATE TRIGGER crm_opportunities_lost_reason_scope_guard BEFORE INSERT OR UPDATE OF lost_reason_id ON crm_opportunities
FOR EACH ROW EXECUTE FUNCTION crm_validate_lost_reason_scope();

-- Seed defaults once per existing company. Tenants may deactivate defaults and add their own.
INSERT INTO crm_lost_reasons(id,tenant_id,company_id,code,label,is_system,sort_order)
SELECT md5(c."tenantId"||':'||c.id||':'||v.code),c."tenantId",c.id,v.code,v.label,TRUE,v.sort_order
FROM companies c
CROSS JOIN (VALUES
 ('PRICE','Fiyat',10),('COMPETITOR','Rakip',20),('NO_RESPONSE','Yanıt alınamadı',30),
 ('TIMING','Zamanlama uygun değil',40),('LOCATION','Konum',50),('FINANCING_PAYMENT','Finansman / ödeme',60),
 ('UNAVAILABLE','Hizmet / ürün mevcut değil',70),('UNSUITABLE','Tıbbi / operasyonel olarak uygun değil',80),
 ('NO_SHOW','Randevuya gelmedi',90),('DUPLICATE','Mükerrer kayıt',100),('INVALID','Geçersiz lead',110),('OTHER','Diğer',120)
) AS v(code,label,sort_order)
ON CONFLICT (tenant_id,company_id,code) DO NOTHING;
