import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('RFQ purchase order origin commercial snapshot migration', () => {
  it('preserves awarded quote commercial terms in the immutable origin snapshot', () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../../../packages/database/prisma/migrations/20260912235800_supplier_quote_commercial_terms/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain("'paymentTermsDays', sq.\"payment_terms_days\"");
    expect(migration).toContain("'warrantyMonths', sq.\"warranty_months\"");
    expect(migration).toContain("'installationIncluded', sq.\"installation_included\"");
    expect(migration).toContain("'trainingIncluded', sq.\"training_included\"");
    expect(migration).toContain("'serviceSlaDays', sq.\"service_sla_days\"");
    expect(migration).toContain("'financingAvailable', sq.\"financing_available\"");
    expect(migration).toContain('procurement_purchase_order_origins');
  });
});
