-- CRM Phase 1 / 5.1: durable normalized lead identities.
-- Keep the raw contact values intact; normalized values are derived only for matching/search.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT,
  ADD COLUMN IF NOT EXISTS normalized_email TEXT;

CREATE OR REPLACE FUNCTION crm_normalize_phone(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT NULLIF(regexp_replace(value, '[^0-9]+', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION crm_normalize_email(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT NULLIF(lower(btrim(value)), '');
$$;

UPDATE crm_leads
SET normalized_phone = crm_normalize_phone(phone),
    normalized_email = crm_normalize_email(email)
WHERE normalized_phone IS DISTINCT FROM crm_normalize_phone(phone)
   OR normalized_email IS DISTINCT FROM crm_normalize_email(email);

CREATE OR REPLACE FUNCTION crm_leads_sync_normalized_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_phone := crm_normalize_phone(NEW.phone);
  NEW.normalized_email := crm_normalize_email(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_sync_normalized_identity_trigger ON crm_leads;
CREATE TRIGGER crm_leads_sync_normalized_identity_trigger
BEFORE INSERT OR UPDATE OF phone, email
ON crm_leads
FOR EACH ROW
EXECUTE FUNCTION crm_leads_sync_normalized_identity();

-- Scope indexes by tenant/company/branch so future duplicate detection cannot accidentally
-- broaden a lookup across tenant boundaries. These are intentionally non-unique: Phase 1
-- requires confidence-based duplicate candidates, not automatic merge/rejection.
CREATE INDEX IF NOT EXISTS idx_crm_leads_normalized_phone_scope
  ON crm_leads(tenant_id, company_id, branch_id, normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_normalized_email_scope
  ON crm_leads(tenant_id, company_id, branch_id, normalized_email)
  WHERE normalized_email IS NOT NULL;

-- Forward-safety checks: fail the migration if the backfill did not converge.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM crm_leads
    WHERE normalized_phone IS DISTINCT FROM crm_normalize_phone(phone)
       OR normalized_email IS DISTINCT FROM crm_normalize_email(email)
  ) THEN
    RAISE EXCEPTION 'CRM lead normalized identity backfill verification failed';
  END IF;
END;
$$;
