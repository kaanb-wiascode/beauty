BEGIN;

CREATE TABLE crm_lead_sla_policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  warning_minutes INTEGER NOT NULL DEFAULT 5 CHECK(warning_minutes BETWEEN 1 AND 1440),
  breach_minutes INTEGER NOT NULL DEFAULT 15 CHECK(breach_minutes BETWEEN 2 AND 4320),
  owner_escalation_minutes INTEGER NOT NULL DEFAULT 10 CHECK(owner_escalation_minutes BETWEEN 1 AND 4320),
  manager_escalation_minutes INTEGER NOT NULL DEFAULT 20 CHECK(manager_escalation_minutes BETWEEN 2 AND 10080),
  reassignment_escalation_minutes INTEGER NOT NULL DEFAULT 30 CHECK(reassignment_escalation_minutes BETWEEN 3 AND 20160),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,company_id,branch_id),
  CHECK(warning_minutes < breach_minutes),
  CHECK(owner_escalation_minutes < manager_escalation_minutes),
  CHECK(manager_escalation_minutes < reassignment_escalation_minutes)
);

CREATE TABLE crm_lead_sla_clocks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  policy_version INTEGER NOT NULL DEFAULT 0 CHECK(policy_version >= 0),
  started_at TIMESTAMPTZ NOT NULL,
  warning_due_at TIMESTAMPTZ NOT NULL,
  breach_due_at TIMESTAMPTZ NOT NULL,
  owner_escalation_due_at TIMESTAMPTZ NOT NULL,
  manager_escalation_due_at TIMESTAMPTZ NOT NULL,
  reassignment_due_at TIMESTAMPTZ NOT NULL,
  first_outbound_at TIMESTAMPTZ,
  first_customer_response_at TIMESTAMPTZ,
  first_meaningful_contact_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_kind TEXT CHECK(completion_kind IS NULL OR completion_kind IN ('OUTBOUND_ATTEMPT','MEANINGFUL_CONTACT')),
  status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK(status IN ('HEALTHY','WARNING','BREACHED','COMPLETED')),
  last_escalation_level INTEGER NOT NULL DEFAULT 0 CHECK(last_escalation_level BETWEEN 0 AND 3),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,company_id,branch_id,lead_id),
  CHECK(warning_due_at <= breach_due_at),
  CHECK(completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX crm_lead_sla_clocks_queue_idx
  ON crm_lead_sla_clocks(tenant_id,company_id,branch_id,status,breach_due_at)
  WHERE completed_at IS NULL;
CREATE INDEX crm_lead_sla_clocks_owner_idx
  ON crm_lead_sla_clocks(tenant_id,company_id,branch_id,owner_user_id,status)
  WHERE owner_user_id IS NOT NULL;

CREATE TABLE crm_lead_sla_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  clock_id TEXT NOT NULL REFERENCES crm_lead_sla_clocks(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('OWNER_ESCALATED','MANAGER_ESCALATED','REASSIGNMENT_REQUIRED')),
  escalation_level INTEGER NOT NULL CHECK(escalation_level BETWEEN 1 AND 3),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(clock_id,event_type)
);

CREATE INDEX crm_lead_sla_events_scope_time_idx
  ON crm_lead_sla_events(tenant_id,company_id,branch_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION validate_crm_lead_sla_policy_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm lead sla policy organization scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_lead_sla_policies_scope_guard
BEFORE INSERT OR UPDATE ON crm_lead_sla_policies
FOR EACH ROW EXECUTE FUNCTION validate_crm_lead_sla_policy_scope();

CREATE OR REPLACE FUNCTION validate_crm_lead_sla_clock_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM crm_leads l
    WHERE l.id=NEW.lead_id AND l.tenant_id=NEW.tenant_id
      AND l.company_id=NEW.company_id AND l.branch_id=NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm lead sla clock scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_lead_sla_clocks_scope_guard
BEFORE INSERT OR UPDATE ON crm_lead_sla_clocks
FOR EACH ROW EXECUTE FUNCTION validate_crm_lead_sla_clock_scope();

CREATE OR REPLACE FUNCTION validate_crm_lead_sla_event_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM crm_lead_sla_clocks c
    WHERE c.id=NEW.clock_id AND c.lead_id=NEW.lead_id
      AND c.tenant_id=NEW.tenant_id AND c.company_id=NEW.company_id AND c.branch_id=NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm lead sla event scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_lead_sla_events_scope_guard
BEFORE INSERT ON crm_lead_sla_events
FOR EACH ROW EXECUTE FUNCTION validate_crm_lead_sla_event_scope();

CREATE OR REPLACE FUNCTION crm_lead_sla_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'crm lead sla events are append-only';
END;
$$;

CREATE TRIGGER crm_lead_sla_events_append_only_guard
BEFORE UPDATE OR DELETE ON crm_lead_sla_events
FOR EACH ROW EXECUTE FUNCTION crm_lead_sla_events_append_only();

CREATE OR REPLACE FUNCTION crm_sync_lead_sla_clock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_warning INTEGER := 5;
  v_breach INTEGER := 15;
  v_owner_escalation INTEGER := 10;
  v_manager_escalation INTEGER := 20;
  v_reassignment INTEGER := 30;
  v_policy_version INTEGER := 0;
  v_started_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT warning_minutes,breach_minutes,owner_escalation_minutes,manager_escalation_minutes,
         reassignment_escalation_minutes,version
  INTO v_warning,v_breach,v_owner_escalation,v_manager_escalation,v_reassignment,v_policy_version
  FROM crm_lead_sla_policies
  WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND branch_id=NEW.branch_id
  LIMIT 1;

  IF NOT FOUND THEN
    v_warning := 5;
    v_breach := 15;
    v_owner_escalation := 10;
    v_manager_escalation := 20;
    v_reassignment := 30;
    v_policy_version := 0;
  END IF;

  v_started_at := COALESCE(NEW.first_assigned_at,NEW.created_at,NOW());
  v_completed_at := CASE WHEN NEW.first_contacted_at IS NULL THEN NULL ELSE GREATEST(NEW.first_contacted_at,v_started_at) END;
  v_status := CASE
    WHEN v_completed_at IS NOT NULL THEN 'COMPLETED'
    WHEN NOW() >= v_started_at + (v_breach * INTERVAL '1 minute') THEN 'BREACHED'
    WHEN NOW() >= v_started_at + (v_warning * INTERVAL '1 minute') THEN 'WARNING'
    ELSE 'HEALTHY'
  END;

  INSERT INTO crm_lead_sla_clocks(
    tenant_id,company_id,branch_id,lead_id,owner_user_id,policy_version,started_at,
    warning_due_at,breach_due_at,owner_escalation_due_at,manager_escalation_due_at,reassignment_due_at,
    first_meaningful_contact_at,completed_at,completion_kind,status
  ) VALUES(
    NEW.tenant_id,NEW.company_id,NEW.branch_id,NEW.id,NEW.owner_user_id,v_policy_version,v_started_at,
    v_started_at+(v_warning*INTERVAL '1 minute'),v_started_at+(v_breach*INTERVAL '1 minute'),
    v_started_at+(v_owner_escalation*INTERVAL '1 minute'),v_started_at+(v_manager_escalation*INTERVAL '1 minute'),
    v_started_at+(v_reassignment*INTERVAL '1 minute'),NEW.first_contacted_at,v_completed_at,
    CASE WHEN v_completed_at IS NOT NULL THEN 'MEANINGFUL_CONTACT' ELSE NULL END,v_status
  )
  ON CONFLICT(tenant_id,company_id,branch_id,lead_id) DO UPDATE SET
    owner_user_id=EXCLUDED.owner_user_id,
    first_meaningful_contact_at=COALESCE(crm_lead_sla_clocks.first_meaningful_contact_at,EXCLUDED.first_meaningful_contact_at),
    completed_at=COALESCE(crm_lead_sla_clocks.completed_at,EXCLUDED.completed_at),
    completion_kind=COALESCE(crm_lead_sla_clocks.completion_kind,EXCLUDED.completion_kind),
    status=CASE
      WHEN crm_lead_sla_clocks.completed_at IS NOT NULL OR EXCLUDED.completed_at IS NOT NULL THEN 'COMPLETED'
      ELSE crm_lead_sla_clocks.status
    END,
    version=crm_lead_sla_clocks.version+1,
    updated_at=NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_sla_sync ON crm_leads;
CREATE TRIGGER crm_leads_sla_sync
AFTER INSERT OR UPDATE OF owner_user_id,first_assigned_at,first_contacted_at,status ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_sync_lead_sla_clock();

CREATE OR REPLACE FUNCTION crm_sync_lead_sla_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_occurred_at TIMESTAMPTZ;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.direction='INBOUND' THEN
    v_occurred_at := COALESCE(NEW.delivered_at,NEW.created_at,NOW());
    UPDATE crm_lead_sla_clocks
    SET first_customer_response_at=v_occurred_at,version=version+1,updated_at=NOW()
    WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND branch_id=NEW.branch_id
      AND lead_id=NEW.lead_id
      AND (first_customer_response_at IS NULL OR v_occurred_at < first_customer_response_at);
  ELSIF NEW.direction='OUTBOUND' AND NEW.status IN ('SENT','DELIVERED') THEN
    v_occurred_at := COALESCE(NEW.sent_at,NEW.created_at,NOW());
    UPDATE crm_lead_sla_clocks
    SET first_outbound_at=CASE
          WHEN first_outbound_at IS NULL OR v_occurred_at < first_outbound_at THEN v_occurred_at
          ELSE first_outbound_at
        END,
        completed_at=CASE
          WHEN completed_at IS NULL THEN GREATEST(v_occurred_at,started_at)
          WHEN GREATEST(v_occurred_at,started_at) < completed_at THEN GREATEST(v_occurred_at,started_at)
          ELSE completed_at
        END,
        completion_kind=CASE
          WHEN completed_at IS NULL OR GREATEST(v_occurred_at,started_at) < completed_at THEN 'OUTBOUND_ATTEMPT'
          ELSE completion_kind
        END,
        status='COMPLETED',version=version+1,updated_at=NOW()
    WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND branch_id=NEW.branch_id
      AND lead_id=NEW.lead_id
      AND (first_outbound_at IS NULL OR v_occurred_at < first_outbound_at OR completed_at IS NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_messages_lead_sla_sync ON crm_messages;
CREATE TRIGGER crm_messages_lead_sla_sync
AFTER INSERT OR UPDATE OF status,sent_at,delivered_at ON crm_messages
FOR EACH ROW EXECUTE FUNCTION crm_sync_lead_sla_from_message();

-- Backfill clocks for already assigned leads. Existing first-contact facts close the clock safely.
INSERT INTO crm_lead_sla_clocks(
  tenant_id,company_id,branch_id,lead_id,owner_user_id,policy_version,started_at,
  warning_due_at,breach_due_at,owner_escalation_due_at,manager_escalation_due_at,reassignment_due_at,
  first_meaningful_contact_at,completed_at,completion_kind,status
)
SELECT l.tenant_id,l.company_id,l.branch_id,l.id,l.owner_user_id,COALESCE(p.version,0),
       COALESCE(l.first_assigned_at,l.created_at),
       COALESCE(l.first_assigned_at,l.created_at)+(COALESCE(p.warning_minutes,5)*INTERVAL '1 minute'),
       COALESCE(l.first_assigned_at,l.created_at)+(COALESCE(p.breach_minutes,15)*INTERVAL '1 minute'),
       COALESCE(l.first_assigned_at,l.created_at)+(COALESCE(p.owner_escalation_minutes,10)*INTERVAL '1 minute'),
       COALESCE(l.first_assigned_at,l.created_at)+(COALESCE(p.manager_escalation_minutes,20)*INTERVAL '1 minute'),
       COALESCE(l.first_assigned_at,l.created_at)+(COALESCE(p.reassignment_escalation_minutes,30)*INTERVAL '1 minute'),
       l.first_contacted_at,
       CASE WHEN l.first_contacted_at IS NULL THEN NULL ELSE GREATEST(l.first_contacted_at,COALESCE(l.first_assigned_at,l.created_at)) END,
       CASE WHEN l.first_contacted_at IS NOT NULL THEN 'MEANINGFUL_CONTACT' ELSE NULL END,
       CASE
         WHEN l.first_contacted_at IS NOT NULL THEN 'COMPLETED'
         WHEN NOW() >= COALESCE(l.first_assigned_at,l.created_at)+(COALESCE(p.breach_minutes,15)*INTERVAL '1 minute') THEN 'BREACHED'
         WHEN NOW() >= COALESCE(l.first_assigned_at,l.created_at)+(COALESCE(p.warning_minutes,5)*INTERVAL '1 minute') THEN 'WARNING'
         ELSE 'HEALTHY'
       END
FROM crm_leads l
LEFT JOIN crm_lead_sla_policies p
  ON p.tenant_id=l.tenant_id AND p.company_id=l.company_id AND p.branch_id=l.branch_id
WHERE l.owner_user_id IS NOT NULL
ON CONFLICT(tenant_id,company_id,branch_id,lead_id) DO NOTHING;

WITH outbound AS (
  SELECT tenant_id,company_id,branch_id,lead_id,MIN(COALESCE(sent_at,created_at)) AS first_outbound_at
  FROM crm_messages
  WHERE lead_id IS NOT NULL AND direction='OUTBOUND' AND status IN ('SENT','DELIVERED')
  GROUP BY tenant_id,company_id,branch_id,lead_id
)
UPDATE crm_lead_sla_clocks c
SET first_outbound_at=o.first_outbound_at,
    completed_at=CASE
      WHEN c.completed_at IS NULL THEN GREATEST(o.first_outbound_at,c.started_at)
      ELSE LEAST(c.completed_at,GREATEST(o.first_outbound_at,c.started_at))
    END,
    completion_kind=CASE
      WHEN c.completed_at IS NULL OR GREATEST(o.first_outbound_at,c.started_at)<c.completed_at THEN 'OUTBOUND_ATTEMPT'
      ELSE c.completion_kind
    END,
    status='COMPLETED',version=version+1,updated_at=NOW()
FROM outbound o
WHERE c.tenant_id=o.tenant_id AND c.company_id=o.company_id AND c.branch_id=o.branch_id AND c.lead_id=o.lead_id;

WITH inbound AS (
  SELECT tenant_id,company_id,branch_id,lead_id,MIN(COALESCE(delivered_at,created_at)) AS first_customer_response_at
  FROM crm_messages
  WHERE lead_id IS NOT NULL AND direction='INBOUND'
  GROUP BY tenant_id,company_id,branch_id,lead_id
)
UPDATE crm_lead_sla_clocks c
SET first_customer_response_at=i.first_customer_response_at,version=version+1,updated_at=NOW()
FROM inbound i
WHERE c.tenant_id=i.tenant_id AND c.company_id=i.company_id AND c.branch_id=i.branch_id AND c.lead_id=i.lead_id;

COMMIT;
