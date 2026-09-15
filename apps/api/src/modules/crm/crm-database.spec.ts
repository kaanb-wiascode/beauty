import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CRM database invariants', () => {
  const readMigration = (name: string) => readFileSync(
    resolve(__dirname, `../../../../../packages/database/prisma/migrations/${name}/migration.sql`),
    'utf8',
  );
  const migration = readMigration('20260913001000_crm_pipeline_foundation');
  const followUpLifecycleMigration = readMigration('20260913002000_crm_follow_up_lifecycle');
  const saleLinkageMigration = readMigration('20260913163000_crm_opportunity_sale_linkage');
  const contactContextMigration = readMigration('20260915173500_crm_lead_contact_context');
  const acquisitionContextMigration = readMigration('20260915174500_crm_lead_acquisition_context');
  const commercialContextMigration = readMigration('20260915175500_crm_lead_commercial_context');
  const salesContextMigration = readMigration('20260915180500_crm_lead_sales_context');
  const salesLifecycleMigration = readMigration('20260915181000_crm_lead_sales_lifecycle_guard');
  const mergeMigration = readMigration('20260915184500_crm_lead_merge_foundation');

  it('locks organization and subject scope at database level', () => {
    expect(migration).toContain('validate_crm_scope');
    expect(migration).toContain('crm_leads_scope_guard');
    expect(migration).toContain('crm_opportunities_scope_guard');
    expect(migration).toContain('crm_follow_ups_scope_guard');
    expect(migration).toContain('crm_events_scope_guard');
    expect(migration).toContain('crm customer scope mismatch');
  });

  it('enforces one opportunity per lead and one subject per follow-up', () => {
    expect(migration).toContain('crm_opportunities_lead_key');
    expect(migration).toContain('num_nonnulls("lead_id", "opportunity_id") = 1');
    expect(migration).toContain('crm_leads_contact_check');
  });

  it('keeps CRM history append-only and grants permissions explicitly', () => {
    expect(migration).toContain('crm_events_append_only_guard');
    expect(migration).toContain("'crm', 'read'");
    expect(migration).toContain("'crm', 'manage'");
  });

  it('guards follow-up cancellation metadata and optimistic versions', () => {
    expect(followUpLifecycleMigration).toContain('crm_follow_ups_version_check');
    expect(followUpLifecycleMigration).toContain('crm_follow_ups_cancellation_check');
    expect(followUpLifecycleMigration).toContain('"cancelled_at" IS NOT NULL');
    expect(followUpLifecycleMigration).toContain('"cancellation_reason" IS NOT NULL');
  });

  it('keeps opportunity to sale linkage unique, scoped and snapshotted', () => {
    expect(saleLinkageMigration).toContain('crm_opportunities_sale_id_key');
    expect(saleLinkageMigration).toContain('crm_opportunities_sale_id_fkey');
    expect(saleLinkageMigration).toContain('crm_opportunities_sale_scope_guard');
    expect(saleLinkageMigration).toContain('commercial_snapshot');
    expect(saleLinkageMigration).toContain('converted_at');
    expect(saleLinkageMigration).toContain('crm opportunity sale scope mismatch');
  });

  it('normalizes lead contact identities inside the database', () => {
    expect(contactContextMigration).toContain('crm_leads_sync_normalized_identity');
    expect(contactContextMigration).toContain('normalized_alternative_phone');
    expect(contactContextMigration).toContain('idx_crm_leads_normalized_alt_phone_scope');
  });

  it('persists structured acquisition attribution with scoped indexes', () => {
    expect(acquisitionContextMigration).toContain('source_detail');
    expect(acquisitionContextMigration).toContain('campaign_id');
    expect(acquisitionContextMigration).toContain('ad_set_id');
    expect(acquisitionContextMigration).toContain('utm_source');
    expect(acquisitionContextMigration).toContain('utm_campaign');
    expect(acquisitionContextMigration).toContain('click_identifiers JSONB');
    expect(acquisitionContextMigration).toContain('crm_leads_click_identifiers_object_check');
    expect(acquisitionContextMigration).toContain('idx_crm_leads_acquisition_campaign_scope');
    expect(acquisitionContextMigration).toContain('tenant_id, company_id, branch_id');
  });

  it('persists structured lead commercial intent with controlled values', () => {
    expect(commercialContextMigration).toContain('interested_service_ids TEXT[]');
    expect(commercialContextMigration).toContain('interested_package_ids TEXT[]');
    expect(commercialContextMigration).toContain('preferred_branch_id TEXT');
    expect(commercialContextMigration).toContain('estimated_budget NUMERIC(18,2)');
    expect(commercialContextMigration).toContain('crm_leads_estimated_budget_check');
    expect(commercialContextMigration).toContain('crm_leads_purchase_urgency_check');
    expect(commercialContextMigration).toContain('crm_leads_consultation_need_check');
    expect(commercialContextMigration).toContain('idx_crm_leads_preferred_branch_scope');
    expect(commercialContextMigration).toContain('idx_crm_leads_interested_services_gin');
    expect(commercialContextMigration).toContain('idx_crm_leads_interested_packages_gin');
  });

  it('constrains lead scoring and sales temperature', () => {
    expect(salesContextMigration).toContain('lead_score INTEGER NOT NULL DEFAULT 0');
    expect(salesContextMigration).toContain('lead_temperature TEXT NOT NULL DEFAULT');
    expect(salesContextMigration).toContain('lead_score BETWEEN 0 AND 100');
    expect(salesContextMigration).toContain("lead_temperature IN ('COLD','WARM','HOT')");
    expect(salesContextMigration).toContain('idx_crm_leads_sales_queue_scope');
  });

  it('derives and preserves first-occurrence sales lifecycle timestamps', () => {
    expect(salesLifecycleMigration).toContain('crm_leads_sync_sales_lifecycle');
    expect(salesLifecycleMigration).toContain('first_assigned_at := NOW()');
    expect(salesLifecycleMigration).toContain('first_contacted_at := NOW()');
    expect(salesLifecycleMigration).toContain('qualified_at := NOW()');
    expect(salesLifecycleMigration).toContain('disqualified_at := NOW()');
    expect(salesLifecycleMigration).toContain('crm_leads_preserve_first_lifecycle_facts');
    expect(salesLifecycleMigration).toContain('OLD.first_response_at');
  });

  it('keeps controlled lead merges scoped and auditable without hard deletion', () => {
    expect(mergeMigration).toContain('merged_into_lead_id');
    expect(mergeMigration).toContain('merged_at');
    expect(mergeMigration).toContain('merged_by_user_id');
    expect(mergeMigration).toContain('crm_leads_merge_scope_guard');
    expect(mergeMigration).toContain('lead merge target scope mismatch');
    expect(mergeMigration).toContain('idx_crm_leads_merged_target_scope');
    expect(mergeMigration).not.toContain('DELETE FROM crm_leads');
  });
});
