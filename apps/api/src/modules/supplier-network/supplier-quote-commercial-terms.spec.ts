import { Prisma } from '@beauty-erp/database';
import { SupplierQuoteService } from './supplier-quote.service';
import type { SupplierPortalPrincipal } from './supplier-portal-auth.service';

const principal: SupplierPortalPrincipal = {
  tokenType: 'supplier_portal',
  sub: 'user-1',
  supplierOrganizationId: 'supplier-org-1',
  supplierMembershipId: 'membership-1',
  supplierRole: 'ADMIN',
};

describe('SupplierQuoteService commercial terms', () => {
  it('persists commercial terms and snapshots them in the created audit event', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { rfqSupplierId: 'rfq-supplier-1', status: 'PUBLISHED', responseDeadline: null },
      ])
      .mockResolvedValueOnce([{ id: 'rfq-item-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'quote-1', version: 1 }])
      .mockResolvedValueOnce([{ id: 'rfq-1', quoteId: 'quote-1' }])
      .mockResolvedValueOnce([]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(async (callback, options) => {
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return callback(tx);
    });
    const service = new SupplierQuoteService({ $transaction: transaction } as never);

    await service.save(principal, 'rfq-1', {
      currency: 'TRY',
      paymentTermsDays: 45,
      warrantyMonths: 24,
      installationIncluded: true,
      trainingIncluded: true,
      serviceSlaDays: 2,
      financingAvailable: true,
      items: [{ rfqItemId: 'rfq-item-1', unitPrice: 1250, leadTimeDays: 5 }],
    });

    const insertSql = String(query.mock.calls[3][0]);
    expect(insertSql).toContain('payment_terms_days');
    expect(insertSql).toContain('warranty_months');
    expect(insertSql).toContain('installation_included');
    expect(insertSql).toContain('training_included');
    expect(insertSql).toContain('service_sla_days');
    expect(insertSql).toContain('financing_available');
    expect(query.mock.calls[3]).toEqual(expect.arrayContaining([45, 24, true, 2]));

    const createdEvent = execute.mock.calls.find((call) =>
      String(call[0]).includes("'CREATED'") && String(call[0]).includes('supplier_quote_events'),
    );
    expect(createdEvent).toBeDefined();
    const metadata = JSON.parse(String(createdEvent?.[5]));
    expect(metadata.commercialTerms).toEqual({
      paymentTermsDays: 45,
      warrantyMonths: 24,
      installationIncluded: true,
      trainingIncluded: true,
      serviceSlaDays: 2,
      financingAvailable: true,
    });
  });

  it('projects commercial terms back to the supplier workspace', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'rfq-1' }]).mockResolvedValueOnce([]);
    const service = new SupplierQuoteService({ $queryRawUnsafe: query } as never);

    await service.get(principal, 'rfq-1');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('sq.payment_terms_days AS "paymentTermsDays"');
    expect(sql).toContain('sq.warranty_months AS "warrantyMonths"');
    expect(sql).toContain('sq.installation_included AS "installationIncluded"');
    expect(sql).toContain('sq.training_included AS "trainingIncluded"');
    expect(sql).toContain('sq.service_sla_days AS "serviceSlaDays"');
    expect(sql).toContain('sq.financing_available AS "financingAvailable"');
  });
});
