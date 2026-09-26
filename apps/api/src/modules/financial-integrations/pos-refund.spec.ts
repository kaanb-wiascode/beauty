import { PosRefundService } from './pos-refund.service';

describe('PosRefundService', () => {
  it('resumes accounting after provider success without calling provider again', async () => {
    const providerOccurredAt = new Date('2026-09-12T18:30:00.000Z');
    const transaction = {
      id: 'pos-1',
      providerTransactionId: 'provider-tx-1',
      status: 'CAPTURED',
      amount: 100,
      currency: 'TRY',
      branchId: 'branch-1',
      integrationId: 'integration-1',
      provider: 'PAYTR',
    };
    const existing = {
      id: 'refund-request-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      integrationId: 'integration-1',
      posTransactionId: 'pos-1',
      externalEventId: 'refund-42',
      provider: 'PAYTR',
      providerTransactionId: 'provider-tx-1',
      amount: 25,
      currency: 'TRY',
      status: 'PROVIDER_SUCCEEDED',
      providerReference: 'provider-ref-1',
      providerOccurredAt,
      providerFeeAmount: 1.25,
      financialEventId: null,
    };

    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([transaction])
        .mockResolvedValueOnce([existing]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const providers = { get: jest.fn() };
    const vault = { loadOpaque: jest.fn() };
    const financialEvents = {
      recordInScope: jest.fn().mockResolvedValue({
        id: 'financial-event-1',
        accountingJournalEntryId: 'journal-1',
        duplicate: false,
      }),
    };
    const tenant = {
      getTenantId: () => 'tenant-1',
      getCompanyId: () => 'company-1',
      getBranchId: () => 'branch-1',
    };

    const service = new PosRefundService(
      prisma as never,
      tenant as never,
      providers as never,
      vault as never,
      financialEvents as never,
    );

    await expect(service.refund('pos-1', { amount: 25, externalEventId: 'refund-42' }))
      .resolves.toMatchObject({
        id: 'refund-request-1',
        duplicate: true,
        status: 'SUCCEEDED',
      });

    expect(providers.get).not.toHaveBeenCalled();
    expect(vault.loadOpaque).not.toHaveBeenCalled();
    expect(financialEvents.recordInScope).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
      'pos-1',
      expect.objectContaining({
        eventType: 'REFUND',
        externalEventId: 'refund-42',
        amount: 25,
        feeAmount: 1.25,
        occurredAt: providerOccurredAt,
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status='SUCCEEDED'"),
      'refund-request-1',
      'financial-event-1',
    );
  });

  it('marks an ambiguous provider failure for manual review and keeps accounting untouched', async () => {
    const transaction = {
      id: 'pos-1',
      providerTransactionId: 'provider-tx-1',
      status: 'CAPTURED',
      amount: 100,
      currency: 'TRY',
      branchId: 'branch-1',
      integrationId: 'integration-1',
      provider: 'PAYTR',
    };
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([transaction])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const providerError = new Error('provider timeout');
    const refundPosTransaction = jest.fn().mockRejectedValue(providerError);
    const providers = {
      get: jest.fn().mockReturnValue({
        capabilities: { posRefunds: true },
        refundPosTransaction,
      }),
    };
    const vault = { loadOpaque: jest.fn().mockResolvedValue({ apiKey: 'secret' }) };
    const financialEvents = { recordInScope: jest.fn() };
    const tenant = {
      getTenantId: () => 'tenant-1',
      getCompanyId: () => 'company-1',
      getBranchId: () => 'branch-1',
    };

    const service = new PosRefundService(
      prisma as never,
      tenant as never,
      providers as never,
      vault as never,
      financialEvents as never,
    );

    await expect(
      service.refund('pos-1', { amount: 25, externalEventId: 'refund-timeout-1' }),
    ).rejects.toBe(providerError);

    expect(refundPosTransaction).toHaveBeenCalledTimes(1);
    expect(financialEvents.recordInScope).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status='REVIEW_REQUIRED'"),
      expect.any(String),
    );
  });
});
