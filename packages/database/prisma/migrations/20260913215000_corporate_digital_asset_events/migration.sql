BEGIN;

CREATE TABLE corporate_digital_asset_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  asset_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corporate_digital_asset_event_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT corporate_digital_asset_event_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT corporate_digital_asset_event_asset_fk FOREIGN KEY (asset_id) REFERENCES corporate_brand_assets(id) ON DELETE CASCADE,
  CONSTRAINT corporate_digital_asset_event_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX corporate_digital_asset_event_asset_idx
  ON corporate_digital_asset_events(company_id, asset_id, created_at DESC);

CREATE OR REPLACE FUNCTION validate_corporate_digital_asset_event_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM corporate_brand_assets a
    WHERE a.id=NEW.asset_id
      AND a.tenant_id=NEW.tenant_id
      AND a.company_id=NEW.company_id
      AND a.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'corporate digital asset event scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_digital_asset_event_scope_guard
BEFORE INSERT ON corporate_digital_asset_events
FOR EACH ROW EXECUTE FUNCTION validate_corporate_digital_asset_event_scope();

COMMIT;
