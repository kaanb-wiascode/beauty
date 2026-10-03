import { BadRequestException } from '@nestjs/common';
import { PosSettlementService } from './pos-settlement.service';

describe('PosSettlementService', () => {
  function createService(query: jest.Mock) {
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      chartOfAccount: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      journalEntry: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      $queryRawUnsafe: query,
    } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    return { service: new PosSettlementService(prisma, tenant), tx };
  }

  it('returns the existing settlement for an exact provider replay without posting again', async () => {
    const settledAt = new Date('2026-09-10T15:00:00.000Z');
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: 'integration-a', tenantId: 'tenant-a', companyId: 'company-a', branchId: 'branch-a',
        kind: 'VIRTUAL_POS', status: 'CONNECTED',
      }])
      .mockResolvedValueOnce([{ id: 'settlement-a', bankAccountId: 'bank-a', settledAt }])
      .mockResolvedValueOnce([{ posTransactionId: 'pos-a' }, { posTransactionId: 'pos-b' }])
      .mockResolvedValueOnce([{
        id: 'settlement-a', integrationId: 'integration-a', bankAccountId: 'bank-a',
        providerSettlementId: 'provider-settlement-1', grossAmount: 100, feeAmount: 2,
        netAmount: 98, currency: 'TRY', settledAt, reconciliationStatus: 'UNMATCHED',
        accountingJournalEntryId: 'journal-a',
      }]);
    const { service, tx } = createService(query);

    const result = await service.record('integration-a', {
      providerSettlementId: 'provider-settlement-1',
      bankAccountId: 'bank-a',
      transactionIds: ['pos-b', 'pos-a'],
      settledAt,
    });

    expect(result).toMatchObject({ id: 'settlement-a', duplicate: true });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of a provider settlement id with different transaction details', async () => {
    const settledAt = new Date('2026-09-10T15:00:00.000Z');
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: 'integration-a', tenantId: 'tenant-a', companyId: 'company-a', branchId: 'branch-a',
        kind: 'VIRTUAL_POS', status: 'CONNECTED',
      }])
      .mockResolvedValueOnce([{ id: 'settlement-a', bankAccountId: null, settledAt }])
      .mockResolvedValueOnce([{ posTransactionId: 'pos-a' }]);
    const { service, tx } = createService(query);

    await expect(service.record('integration-a', {
      providerSettlementId: 'provider-settlement-1',
      transactionIds: ['pos-b'],
      settledAt,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('scopes settlement listing by tenant as well as company and branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service } = createService(query);

    await service.list('integration-a');

    const call = query.mock.calls[0];
    expect(String(call[0])).toContain('s.tenant_id=$1::text');
    expect(call.slice(1)).toEqual(['tenant-a', 'company-a', 'branch-a', 'integration-a']);
  });
});
