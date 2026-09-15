-- CRM Phase 1 / 5.3: duplicate detection signals.
-- These fields are deliberately non-unique: matching creates review candidates and never auto-merges leads.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS provider_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_identity TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_leads_provider_contact_scope
  ON crm_leads(tenant_id, company_id, provider_contact_id)
  WHERE provider_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_whatsapp_identity_scope
  ON crm_leads(tenant_id, company_id, whatsapp_identity)
  WHERE whatsapp_identity IS NOT NULL;

-- Normalize WhatsApp identities to digits where possible while preserving opaque provider identities.
CREATE OR REPLACE FUNCTION crm_normalize_whatsapp_identity(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR btrim(value) = '' THEN NULL
    WHEN regexp_replace(value, '[^0-9]', '', 'g') <> '' THEN regexp_replace(value, '[^0-9]', '', 'g')
    ELSE lower(btrim(value))
  END
$$;

UPDATE crm_leads
SET whatsapp_identity = crm_normalize_whatsapp_identity(whatsapp_identity)
WHERE whatsapp_identity IS NOT NULL;

CREATE OR REPLACE FUNCTION crm_leads_sync_duplicate_identities()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.provider_contact_id := NULLIF(btrim(NEW.provider_contact_id), '');
  NEW.whatsapp_identity := crm_normalize_whatsapp_identity(NEW.whatsapp_identity);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_duplicate_identity_guard ON crm_leads;
CREATE TRIGGER crm_leads_duplicate_identity_guard
BEFORE INSERT OR UPDATE OF provider_contact_id, whatsapp_identity ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_leads_sync_duplicate_identities();
