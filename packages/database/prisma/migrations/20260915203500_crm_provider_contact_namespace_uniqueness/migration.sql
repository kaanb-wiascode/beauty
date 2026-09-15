-- CRM Phase 1 provider identity hardening.
-- The namespace column was introduced separately so legacy provider_contact_id
-- rows remain unclaimed until a provider is known. Once both values are known,
-- one active lead per company may own the external provider identity.

DROP INDEX IF EXISTS crm_leads_provider_contact_namespace_idx;

CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_provider_contact_namespace_uidx
  ON crm_leads (tenant_id, company_id, provider_contact_provider_key, provider_contact_id)
  WHERE provider_contact_provider_key IS NOT NULL
    AND provider_contact_id IS NOT NULL
    AND merged_into_lead_id IS NULL;

COMMENT ON INDEX crm_leads_provider_contact_namespace_uidx IS
  'Prevents concurrent active leads from claiming the same namespaced provider contact identity.';
