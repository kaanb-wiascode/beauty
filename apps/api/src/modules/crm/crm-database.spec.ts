import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CRM database invariants', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../../packages/database/prisma/migrations/20260913001000_crm_pipeline_foundation/migration.sql',
    ),
    'utf8',
  );
  const followUpLifecycleMigration = readFileSync(
    resolve(
      __dirname,
      '../../../../../packages/database/prisma/migrations/20260913002000_crm_follow_up_lifecycle/migration.sql',
    ),
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
    expect(migration).toContain(
      'num_nonnulls("lead_id", "opportunity_id") = 1',
    );
    expect(migration).toContain('crm_leads_contact_check');
  });

  it('keeps CRM history append-only and grants permissions explicitly', () => {
    expect(migration).toContain('crm_events_append_only_guard');
    expect(migration).toContain("'crm', 'read'");
    expect(migration).toContain("'crm', 'manage'");
  });

  it('guards follow-up cancellation metadata and optimistic versions', () => {
    expect(followUpLifecycleMigration).toContain(
      'crm_follow_ups_version_check',
    );
    expect(followUpLifecycleMigration).toContain(
      'crm_follow_ups_cancellation_check',
    );
    expect(followUpLifecycleMigration).toContain('"cancelled_at" IS NOT NULL');
    expect(followUpLifecycleMigration).toContain(
      '"cancellation_reason" IS NOT NULL',
    );
  });
});
