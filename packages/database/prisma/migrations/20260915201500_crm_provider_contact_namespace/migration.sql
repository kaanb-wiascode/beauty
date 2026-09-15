-- Provider contact identifiers are only unique inside their provider namespace.
-- Keeping the provider key next to the external identifier prevents unrelated
-- messaging providers from producing false duplicate candidates.
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS provider_contact_provider_key TEXT;

-- Existing provider_contact_id values predate provider namespacing. Leave their
-- namespace NULL rather than guessing a provider; new inbound identities must
-- persist both values together.
CREATE INDEX IF NOT EXISTS crm_leads_provider_contact_namespace_idx
  ON crm_leads (tenant_id, company_id, provider_contact_provider_key, provider_contact_id)
  WHERE provider_contact_provider_key IS NOT NULL
    AND provider_contact_id IS NOT NULL
    AND merged_into_lead_id IS NULL;

COMMENT ON COLUMN crm_leads.provider_contact_provider_key IS
  'Messaging provider namespace for provider_contact_id; NULL means legacy/unknown provider.';
