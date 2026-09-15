CREATE TABLE IF NOT EXISTS hr_document_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  employment_type TEXT,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  restricted BOOLEAN NOT NULL DEFAULT TRUE,
  requires_expiry BOOLEAN NOT NULL DEFAULT FALSE,
  warning_days INTEGER NOT NULL DEFAULT 30 CHECK (warning_days >= 0 AND warning_days <= 3650),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim(document_type)) > 0),
  CHECK (length(trim(title)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_document_requirement_scope
  ON hr_document_requirements(
    tenant_id,
    company_id,
    COALESCE(branch_id,''),
    document_type,
    COALESCE(employment_type,'')
  );
CREATE INDEX IF NOT EXISTS idx_hr_document_requirements_active
  ON hr_document_requirements(tenant_id,company_id,branch_id,active,required);

-- Seed a conservative baseline for every company. Tenants may deactivate or extend it.
INSERT INTO hr_document_requirements (
  id,tenant_id,company_id,branch_id,document_type,title,description,required,restricted,requires_expiry,warning_days
)
SELECT
  'hrreq-' || md5(c.tenant_id || ':' || c.id || ':' || seed.document_type),
  c.tenant_id,c.id,NULL,seed.document_type,seed.title,seed.description,TRUE,seed.restricted,seed.requires_expiry,seed.warning_days
FROM companies c
CROSS JOIN (VALUES
  ('IDENTITY','Kimlik Belgesi','Çalışanın kimlik/kimlik fotokopisi kaydı.',TRUE,FALSE,30),
  ('EMPLOYMENT_CONTRACT','İş Sözleşmesi','İmzalı iş sözleşmesi veya çalışma sözleşmesi.',TRUE,FALSE,30),
  ('KVKK','KVKK / Açık Rıza','Personel veri işleme ve gerekli açık rıza kayıtları.',TRUE,FALSE,30),
  ('SGK','SGK İşe Giriş Belgesi','İşe giriş ve sosyal güvenlik kayıt belgesi.',TRUE,FALSE,30),
  ('OHS','İSG / OHS Belgesi','İş sağlığı ve güvenliği eğitim/uygunluk kaydı.',FALSE,TRUE,30)
) AS seed(document_type,title,description,restricted,requires_expiry,warning_days)
ON CONFLICT DO NOTHING;
