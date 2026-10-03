-- CRM Phase 1 / 5.1: structured lead personal/contact context.
-- Nullable columns preserve backward compatibility for existing integrations and imports.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS alternative_phone TEXT,
  ADD COLUMN IF NOT EXISTS normalized_alternative_phone TEXT;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_preferred_contact_channel_check;

ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_preferred_contact_channel_check
  CHECK (
    preferred_contact_channel IS NULL OR
    preferred_contact_channel IN ('CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'OTHER')
  );

-- Keep the alternative raw phone for display/audit while deriving its matching identity.
UPDATE crm_leads
SET normalized_alternative_phone = crm_normalize_phone(alternative_phone)
WHERE normalized_alternative_phone IS DISTINCT FROM crm_normalize_phone(alternative_phone);

CREATE OR REPLACE FUNCTION crm_leads_sync_normalized_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_phone := crm_normalize_phone(NEW.phone);
  NEW.normalized_email := crm_normalize_email(NEW.email);
  NEW.normalized_alternative_phone := crm_normalize_phone(NEW.alternative_phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_sync_normalized_identity_trigger ON crm_leads;
CREATE TRIGGER crm_leads_sync_normalized_identity_trigger
BEFORE INSERT OR UPDATE OF phone, email, alternative_phone
ON crm_leads
FOR EACH ROW
EXECUTE FUNCTION crm_leads_sync_normalized_identity();

CREATE INDEX IF NOT EXISTS idx_crm_leads_normalized_alt_phone_scope
  ON crm_leads(tenant_id, company_id, branch_id, normalized_alternative_phone)
  WHERE normalized_alternative_phone IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM crm_leads
    WHERE normalized_alternative_phone IS DISTINCT FROM crm_normalize_phone(alternative_phone)
  ) THEN
    RAISE EXCEPTION 'CRM lead alternative phone normalization verification failed';
  END IF;
END;
$$;
