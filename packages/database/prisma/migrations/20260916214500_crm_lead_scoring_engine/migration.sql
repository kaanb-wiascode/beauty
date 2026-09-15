BEGIN;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS lead_score_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lead_score_explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_score_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lead_score_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_score_version_check,
  DROP CONSTRAINT IF EXISTS crm_leads_score_override_reason_check;

ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_score_version_check CHECK (lead_score_version >= 1),
  ADD CONSTRAINT crm_leads_score_override_reason_check CHECK (
    NOT lead_score_overridden OR (lead_score_override_reason IS NOT NULL AND length(trim(lead_score_override_reason)) > 0)
  );

CREATE TABLE IF NOT EXISTS crm_lead_scoring_policies (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  warm_min INTEGER NOT NULL DEFAULT 50,
  hot_min INTEGER NOT NULL DEFAULT 80,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT crm_lead_scoring_policy_thresholds_check CHECK (
    warm_min BETWEEN 1 AND 99 AND hot_min BETWEEN 2 AND 100 AND warm_min < hot_min
  ),
  CONSTRAINT crm_lead_scoring_policy_version_check CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS crm_lead_score_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  temperature TEXT NOT NULL,
  score_version INTEGER NOT NULL,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'AUTOMATIC',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT crm_lead_score_history_score_check CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT crm_lead_score_history_temperature_check CHECK (temperature IN ('COLD','WARM','HOT')),
  CONSTRAINT crm_lead_score_history_source_check CHECK (source IN ('AUTOMATIC','MANUAL_OVERRIDE')),
  CONSTRAINT crm_lead_score_history_version_check CHECK (score_version >= 1)
);

CREATE INDEX IF NOT EXISTS crm_lead_score_history_scope_idx
  ON crm_lead_score_history(tenant_id, company_id, branch_id, lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION crm_compute_lead_score(
  p_tenant_id TEXT,
  p_phone TEXT,
  p_alternative_phone TEXT,
  p_email TEXT,
  p_source TEXT,
  p_campaign_id TEXT,
  p_utm_source TEXT,
  p_interested_service_ids TEXT[],
  p_interested_package_ids TEXT[],
  p_estimated_budget NUMERIC,
  p_purchase_urgency TEXT,
  p_consultation_need TEXT,
  p_customer_intent TEXT
)
RETURNS TABLE(score INTEGER, temperature TEXT, explanation JSONB)
LANGUAGE plpgsql
AS $$
DECLARE
  v_score INTEGER := 0;
  v_warm_min INTEGER := 50;
  v_hot_min INTEGER := 80;
  v_factors JSONB := '[]'::jsonb;
BEGIN
  SELECT warm_min, hot_min
    INTO v_warm_min, v_hot_min
  FROM crm_lead_scoring_policies
  WHERE tenant_id = p_tenant_id;

  v_warm_min := COALESCE(v_warm_min, 50);
  v_hot_min := COALESCE(v_hot_min, 80);

  IF p_phone IS NOT NULL OR p_alternative_phone IS NOT NULL THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','PHONE_AVAILABLE','points',15));
  END IF;

  IF p_email IS NOT NULL THEN
    v_score := v_score + 10;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','EMAIL_AVAILABLE','points',10));
  END IF;

  IF COALESCE(p_source, 'MANUAL') <> 'MANUAL' THEN
    v_score := v_score + 10;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','ATTRIBUTED_SOURCE','points',10));
  END IF;

  IF p_campaign_id IS NOT NULL OR p_utm_source IS NOT NULL THEN
    v_score := v_score + 10;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','CAMPAIGN_ATTRIBUTION','points',10));
  END IF;

  IF cardinality(COALESCE(p_interested_service_ids, ARRAY[]::TEXT[])) > 0
     OR cardinality(COALESCE(p_interested_package_ids, ARRAY[]::TEXT[])) > 0 THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','PRODUCT_INTEREST','points',15));
  END IF;

  IF p_estimated_budget IS NOT NULL AND p_estimated_budget > 0 THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','BUDGET_DEFINED','points',15));
  END IF;

  IF p_purchase_urgency = 'IMMEDIATE' THEN
    v_score := v_score + 20;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','URGENCY_IMMEDIATE','points',20));
  ELSIF p_purchase_urgency = 'THIS_WEEK' THEN
    v_score := v_score + 15;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','URGENCY_THIS_WEEK','points',15));
  ELSIF p_purchase_urgency = 'THIS_MONTH' THEN
    v_score := v_score + 8;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','URGENCY_THIS_MONTH','points',8));
  END IF;

  IF p_consultation_need IN ('REQUIRED','REQUESTED') THEN
    v_score := v_score + 5;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','CONSULTATION_SIGNAL','points',5));
  END IF;

  IF p_customer_intent IS NOT NULL AND length(trim(p_customer_intent)) >= 20 THEN
    v_score := v_score + 10;
    v_factors := v_factors || jsonb_build_array(jsonb_build_object('factor','INTENT_DETAIL','points',10));
  END IF;

  v_score := LEAST(v_score, 100);

  score := v_score;
  temperature := CASE
    WHEN v_score >= v_hot_min THEN 'HOT'
    WHEN v_score >= v_warm_min THEN 'WARM'
    ELSE 'COLD'
  END;
  explanation := jsonb_build_object(
    'engineVersion', 1,
    'factors', v_factors,
    'thresholds', jsonb_build_object('warmMin', v_warm_min, 'hotMin', v_hot_min)
  );
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION crm_apply_lead_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_result RECORD;
BEGIN
  IF COALESCE(NEW.lead_score_overridden, FALSE) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_result
  FROM crm_compute_lead_score(
    NEW.tenant_id,
    NEW.phone,
    NEW.alternative_phone,
    NEW.email,
    NEW.source,
    NEW.campaign_id,
    NEW.utm_source,
    NEW.interested_service_ids,
    NEW.interested_package_ids,
    NEW.estimated_budget,
    NEW.purchase_urgency,
    NEW.consultation_need,
    NEW.customer_intent
  );

  NEW.lead_score := v_result.score;
  NEW.lead_temperature := v_result.temperature;
  NEW.lead_score_explanation := v_result.explanation;
  NEW.lead_score_updated_at := CURRENT_TIMESTAMP;
  NEW.lead_score_override_reason := NULL;
  NEW.lead_score_overridden := FALSE;

  IF TG_OP = 'UPDATE' THEN
    NEW.lead_score_version := OLD.lead_score_version + 1;
  ELSE
    NEW.lead_score_version := COALESCE(NEW.lead_score_version, 1);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_scoring_before_write ON crm_leads;
CREATE TRIGGER crm_leads_scoring_before_write
BEFORE INSERT OR UPDATE OF
  phone, alternative_phone, email, source, campaign_id, utm_source,
  interested_service_ids, interested_package_ids, estimated_budget,
  purchase_urgency, consultation_need, customer_intent, lead_score_overridden
ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_apply_lead_score();

CREATE OR REPLACE FUNCTION crm_record_lead_score_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.lead_score IS DISTINCT FROM OLD.lead_score
     OR NEW.lead_temperature IS DISTINCT FROM OLD.lead_temperature
     OR NEW.lead_score_version IS DISTINCT FROM OLD.lead_score_version THEN
    INSERT INTO crm_lead_score_history(
      tenant_id, company_id, branch_id, lead_id, score, temperature,
      score_version, explanation, source, reason
    ) VALUES (
      NEW.tenant_id, NEW.company_id, NEW.branch_id, NEW.id, NEW.lead_score, NEW.lead_temperature,
      NEW.lead_score_version, NEW.lead_score_explanation,
      CASE WHEN NEW.lead_score_overridden THEN 'MANUAL_OVERRIDE' ELSE 'AUTOMATIC' END,
      NEW.lead_score_override_reason
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_score_history_after_write ON crm_leads;
CREATE TRIGGER crm_leads_score_history_after_write
AFTER INSERT OR UPDATE OF lead_score, lead_temperature, lead_score_version
ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_record_lead_score_history();

-- Backfill existing leads through the same deterministic engine without overriding manual scores.
UPDATE crm_leads
SET customer_intent = customer_intent
WHERE lead_score_overridden = FALSE;

COMMIT;
