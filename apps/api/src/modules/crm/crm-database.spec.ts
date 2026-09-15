import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CRM database invariants', () => {
  const migration = readFileSync(
    resolve(__dirname, '../../../../../packages/database/prisma/migrations/20260913001000_crm_pipeline_foundation/migration.sql'),
    'utf8',
  );
  const followUpLifecycleMigration = readFileSync(
    resolve(__dirname, '../../../../../packages/database/prisma/migrations/20260913002000_crm_follow_up_lifecycle/migration.sql'),
    'utf8',
  );
  const saleLinkageMigration = readFileSync(
    resolve(__dirname, '../../../../../packages/database/prisma/migrations/20260913163000_crm_opportunity_sale_linkage/migration.sql'),
    'utf8',
  );
  const contactContextMigration = readFileSync(
    resolve(__dirname, '../../../../../packages/database/prisma/migrations/20260915173500_crm_lead_contact_context/migration.sql'),
    'utf8',
  );
  const acquisitionContextMigration = readFileSync(
    resolve(__dirname, '../../../../../packages/database/prisma/migrations/20260915174500_crm_lead_acquisition_context/migration.sql'),
    'utf8',
  );

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
});
