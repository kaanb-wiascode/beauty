import { CommerceFinanceSyncService } from './commerce-finance-sync.service';

describe('CommerceFinanceSyncService base currency', () => {
  it('creates sale income in company base currency with stable raw SQL parameter order', async () => {
    const query = jest.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes("source_type='SALE'") && sql.includes('ORDER BY created_at')) {
        return [];
      }
      if (sql.includes('FROM income_categories')) {
        return [{ id: 'category-1' }];
      }
      if (sql.includes('INSERT INTO income_records')) {
        return [{ id: 'income-1', grossAmount: 1250, collectionStatus: 'UNCOLLECTED' }];
      }
      return [];
    });
    const execute = jest.fn().mockResolvedValue(1);
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      company: {
        findFirst: jest.fn().mockResolvedValue({ baseCurrency: 'EUR' }),
      },
      chartOfAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'account-120', code: '120' },
          { id: 'account-600', code: '600' },
        ]),
      },
    };

    const service = new CommerceFinanceSyncService();
    const result = await service.syncSaleConfirmed(tx as never, {
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      saleId: 'sale-1',
      actorId: 'user-1',
      customerName: 'Müşteri',
      amount: 1250,
      occurredAt: new Date('2026-09-29T12:00:00.000Z'),
    });

    expect(result.id).toBe('income-1');
    const insertCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO income_records'),
    );
    expect(insertCall).toBeDefined();
    const args = insertCall!.slice(1);
    expect(args[9]).toBe('EUR');
    expect(args[10]).toBe('Satış kaydı sale-1');
    expect(args[11]).toBe('sale-1');
    expect(args[12]).toBe('user-1');
    expect(String(insertCall![0])).toContain("'SALE',$12,1,$13::text");
    expect(String(insertCall![0])).not.toContain("'TRY',1");
  });
});
