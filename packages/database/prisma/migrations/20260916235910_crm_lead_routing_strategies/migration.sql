BEGIN;

ALTER TABLE crm_lead_routing_rules
  DROP CONSTRAINT IF EXISTS crm_lead_routing_rules_strategy_check;

ALTER TABLE crm_lead_routing_rules
  ADD CONSTRAINT crm_lead_routing_rules_strategy_check
  CHECK(strategy IN (
    'DIRECT_OWNER',
    'ROUND_ROBIN',
    'LEAST_OPEN_LEADS',
    'LEAST_ACTIVE',
    'FALLBACK_QUEUE'
  ));

COMMIT;
