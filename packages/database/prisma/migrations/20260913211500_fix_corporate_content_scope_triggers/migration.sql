BEGIN;

DROP TRIGGER IF EXISTS corporate_content_items_scope_guard ON corporate_content_items;
DROP TRIGGER IF EXISTS corporate_content_approvals_scope_guard ON corporate_content_approvals;
DROP TRIGGER IF EXISTS corporate_content_events_scope_guard ON corporate_content_events;
DROP FUNCTION IF EXISTS validate_corporate_content_scope();

CREATE OR REPLACE FUNCTION validate_corporate_content_item_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate content company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate content branch scope mismatch';
  END IF;

  IF NEW.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM corporate_communication_campaigns c
    WHERE c.id=NEW.campaign_id
      AND c.tenant_id=NEW.tenant_id
      AND c.company_id=NEW.company_id
      AND (NEW.branch_id IS NULL OR c.branch_id IS NULL OR c.branch_id=NEW.branch_id)
  ) THEN
    RAISE EXCEPTION 'corporate content campaign scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_corporate_content_approval_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate content approval company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate content approval branch scope mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM corporate_content_items c
    WHERE c.id=NEW.content_id
      AND c.tenant_id=NEW.tenant_id
      AND c.company_id=NEW.company_id
      AND c.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'corporate content approval scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_corporate_content_event_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate content event company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate content event branch scope mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM corporate_content_items c
    WHERE c.id=NEW.content_id
      AND c.tenant_id=NEW.tenant_id
      AND c.company_id=NEW.company_id
      AND c.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'corporate content event scope mismatch';
  END IF;

  IF NEW.approval_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM corporate_content_approvals a
    WHERE a.id=NEW.approval_id
      AND a.content_id=NEW.content_id
      AND a.tenant_id=NEW.tenant_id
      AND a.company_id=NEW.company_id
      AND a.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'corporate content event approval scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_content_items_scope_guard
BEFORE INSERT OR UPDATE ON corporate_content_items
FOR EACH ROW EXECUTE FUNCTION validate_corporate_content_item_scope();

CREATE TRIGGER corporate_content_approvals_scope_guard
BEFORE INSERT OR UPDATE ON corporate_content_approvals
FOR EACH ROW EXECUTE FUNCTION validate_corporate_content_approval_scope();

CREATE TRIGGER corporate_content_events_scope_guard
BEFORE INSERT OR UPDATE ON corporate_content_events
FOR EACH ROW EXECUTE FUNCTION validate_corporate_content_event_scope();

COMMIT;
