import { NotFoundException } from '@nestjs/common';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';

describe('FinancialIntegrationSyncService', () => {
  function createService(overrides?: {
    query?: jest.Mock;
    execute?: jest.Mock;
    adapter?: Record<string, unknown>;
    linkage?: jest.Mock;
    reconciliation?: jest.Mock;
  }) {
    const query = overrides?.query ?? jest.fn();
    const execute = overrides?.execute ?? jest.fn().mockResolvedValue(1);
    const prisma = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      $transaction: jest.fn(async (input: unknown) => input),
    } as never;
    const providers = {
      get: jest.fn().mockReturnValue(overrides?.adapter ?? {}),
    } as never;
    const vault = { load: jest.fn().mockResolvedValue({ accessToken: 'test-token' }) } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const linkage = {
      autoLinkOneInScope: overrides?.linkage ?? jest.fn().mockResolvedValue({ linked: true }),
    } as never;
    const reconciliation = {
      autoMatchInScope: overrides?.reconciliation ?? jest.fn().mockResolvedValue({ scanned: 0, matched: 0, skipped: 0 }),
    } as never;
    return {
      service: new FinancialIntegrationSyncService(prisma, providers, vault, tenant, linkage, reconciliation),
      query,
      execute,
      vault: vault as unknown as { load: jest.Mock },
      linkage: linkage as unknown as { autoLinkOneInScope: jest.Mock },
      reconciliation: reconciliation as unknown as { autoMatchInScope: jest.Mock },
    };
  }

  it('scopes interactive synchronization to the active tenant, company and branch', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service, vault } = createService({ query });

    await expect(service.syncIntegration('integration-x')).rejects.toBeInstanceOf(NotFoundException);

    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0];
    expect(String(call[0])).toContain('tenant_id=$2::text');
    expect(String(call[0])).toContain('company_id=$3::text');
    expect(String(call[0])).toContain('branch_id=$4::text');
    expect(call.slice(1)).toEqual(['integration-x', 'tenant-a', 'company-a', 'branch-a']);
    expect(vault.load).not.toHaveBeenCalled();
  });

  it('links synchronized captured POS transactions to SalePayment within provider scope', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: 'integration-pos',
        tenantId: 'tenant-a',
        companyId: 'company-a',
        branchId: 'branch-a',
        kind: 'VIRTUAL_POS',
        provider: 'TESTPOS',
        status: 'CONNECTED',
        lastSyncAt: null,
      }])
      .mockResolvedValueOnce([{ id: 'terminal-a' }])
      .mockResolvedValueOnce([{ id: 'pos-a' }]);
    const linkage = jest.fn().mockResolvedValue({ linked: true, reason: 'WEBHOOK_REFERENCE' });
    const adapter = {
      listPosTransactions: jest.fn().mockResolvedValue([{
        externalTransactionId: 'provider-tx-1',
        occurredAt: new Date('2026-09-10T15:00:00.000Z'),
        grossAmount: 100,
        feeAmount: 2,
        netAmount: 98,
        currency: 'TRY',
        status: 'CAPTURED',
      }]),
    };
    const { service } = createService({ query, adapter, linkage });

    const result = await service.syncIntegration('integration-pos');

    expect(linkage).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', companyId: 'company-a', branchId: 'branch-a' },
      'pos-a',
    );
    expect(result).toMatchObject({
      integrationId: 'integration-pos',
      recordsSynced: 1,
      linkedPayments: 1,
      unresolvedPaymentLinks: 0,
      status: 'SUCCESS',
    });
  });

  it('runs settlement reconciliation immediately after open-banking synchronization', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: 'integration-bank',
        tenantId: 'tenant-a',
        companyId: 'company-a',
        branchId: 'branch-a',
        kind: 'OPEN_BANKING',
        provider: 'TESTBANK',
        status: 'CONNECTED',
        lastSyncAt: null,
      }]);
    const reconciliation = jest.fn().mockResolvedValue({ scanned: 3, matched: 2, skipped: 1 });
    const adapter = {
      listBankAccounts: jest.fn().mockResolvedValue([]),
      listBankTransactions: jest.fn().mockResolvedValue([]),
    };
    const { service } = createService({ query, adapter, reconciliation });

    const result = await service.syncIntegration('integration-bank');

    expect(reconciliation).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', companyId: 'company-a', branchId: 'branch-a' },
      250,
    );
    expect(result).toMatchObject({
      reconciledSettlements: 2,
      unresolvedSettlements: 1,
      status: 'SUCCESS',
    });
  });
});
