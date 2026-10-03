import { BadRequestException } from '@nestjs/common';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';

describe('FinancialIntegrationSyncService paged open banking', () => {
  function createService(adapter: Record<string, any>, query?: jest.Mock) {
    const queryMock =
      query ??
      jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'integration-bank',
            tenantId: 'tenant-a',
            companyId: 'company-a',
            branchId: 'branch-a',
            kind: 'OPEN_BANKING',
            provider: 'TESTBANK',
            status: 'CONNECTED',
            authType: 'OAUTH2',
            lastSyncAt: new Date('2026-09-09T12:00:00.000Z'),
            metadata: { bankTransactionSyncCursor: 'sync-old' },
          },
        ])
        .mockResolvedValueOnce([]);
    const execute = jest.fn().mockResolvedValue(1);
    const transactionClient = {
      $queryRawUnsafe: queryMock,
      $executeRawUnsafe: execute,
    };
    const prisma = {
      $queryRawUnsafe: queryMock,
      $executeRawUnsafe: execute,
      $transaction: jest.fn(async (input: unknown) =>
        typeof input === 'function'
          ? (input as (tx: typeof transactionClient) => unknown)(transactionClient)
          : input,
      ),
    } as never;
    const providers = { get: jest.fn().mockReturnValue(adapter) } as never;
    const vault = {
      load: jest.fn().mockResolvedValue({ accessToken: 'token' }),
      loadOpaque: jest.fn(),
      store: jest.fn(),
    } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const linkage = { autoLinkOneInScope: jest.fn() } as never;
    const reconciliation = {
      autoMatchInScope: jest
        .fn()
        .mockResolvedValue({ scanned: 0, matched: 0, skipped: 0 }),
    } as never;

    return {
      service: new FinancialIntegrationSyncService(
        prisma,
        providers,
        vault,
        tenant,
        linkage,
        reconciliation,
      ),
      execute,
      query: queryMock,
    };
  }

  it('walks account pages and deactivates only accounts missing from the completed provider snapshot', async () => {
    const listBankAccountPage = jest
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            externalAccountId: 'acc-1',
            bankName: 'Test Bank',
            accountName: 'One',
            currency: 'TRY',
          },
        ],
        nextPageCursor: 'page-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            externalAccountId: 'acc-2',
            bankName: 'Test Bank',
            accountName: 'Two',
            currency: 'USD',
          },
        ],
      });
    const { service, execute } = createService({ listBankAccountPage });

    await service.syncIntegration('integration-bank');

    expect(listBankAccountPage).toHaveBeenNthCalledWith(
      1,
      { accessToken: 'token' },
      { pageCursor: undefined },
    );
    expect(listBankAccountPage).toHaveBeenNthCalledWith(
      2,
      { accessToken: 'token' },
      { pageCursor: 'page-2' },
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('SET active=FALSE'),
      'integration-bank',
      'tenant-a',
      'company-a',
      'branch-a',
      ['acc-1', 'acc-2'],
    );
  });

  it('uses a 48-hour overlap while preserving the provider sync cursor', async () => {
    const listBankAccountPage = jest.fn().mockResolvedValue({ items: [] });
    const listBankTransactionPage = jest.fn().mockResolvedValue({
      items: [],
      nextSyncCursor: 'sync-new',
    });
    const { service, execute } = createService({
      listBankAccountPage,
      listBankTransactionPage,
    });

    await service.syncIntegration('integration-bank');

    expect(listBankTransactionPage).toHaveBeenCalledWith(
      { accessToken: 'token' },
      {
        since: new Date('2026-09-07T12:00:00.000Z'),
        pageCursor: undefined,
        syncCursor: 'sync-old',
      },
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('bankTransactionSyncCursor'),
      expect.any(String),
      'sync-new',
      null,
      48,
    );
  });

  it('uses the persisted transaction watermark instead of a newer last-sync timestamp', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'integration-bank',
          tenantId: 'tenant-a',
          companyId: 'company-a',
          branchId: 'branch-a',
          kind: 'OPEN_BANKING',
          provider: 'TESTBANK',
          status: 'CONNECTED',
          authType: 'OAUTH2',
          lastSyncAt: new Date('2026-09-10T12:00:00.000Z'),
          metadata: {
            bankTransactionSyncCursor: 'sync-old',
            bankTransactionWatermark: '2026-09-08T06:00:00.000Z',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    const listBankTransactionPage = jest.fn().mockResolvedValue({ items: [] });
    const { service } = createService(
      {
        listBankAccountPage: jest.fn().mockResolvedValue({ items: [] }),
        listBankTransactionPage,
      },
      query,
    );

    await service.syncIntegration('integration-bank');

    expect(listBankTransactionPage).toHaveBeenCalledWith(
      { accessToken: 'token' },
      expect.objectContaining({
        since: new Date('2026-09-06T06:00:00.000Z'),
        syncCursor: 'sync-old',
      }),
    );
  });

  it('fails closed on repeating provider page cursors before stale account deactivation', async () => {
    const listBankAccountPage = jest
      .fn()
      .mockResolvedValueOnce({ items: [], nextPageCursor: 'same-page' })
      .mockResolvedValueOnce({ items: [], nextPageCursor: 'same-page' });
    const { service, execute } = createService({ listBankAccountPage });

    await expect(service.syncIntegration('integration-bank')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(
      execute.mock.calls.some((call) =>
        String(call[0]).includes('SET active=FALSE'),
      ),
    ).toBe(false);
  });
});
