import { NotFoundException } from '@nestjs/common';
import { FinancialIntegrationHealthService } from './financial-integration-health.service';

describe('FinancialIntegrationHealthService', () => {
  function createService(rows: any[]) {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue(rows) } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const adapter = {
      runtimeReady: true,
      capabilities: { oauth: true, accounts: true, balances: true, bankTransactions: true },
    };
    const providers = {
      has: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue(adapter),
    } as never;
    return {
      service: new FinancialIntegrationHealthService(prisma, tenant, providers),
      prisma: prisma as unknown as { $queryRawUnsafe: jest.Mock },
    };
  }

  it('returns healthy banking metrics and watermark policy for connected scoped integration', async () => {
    const latestBalanceAsOf = new Date();
    const latestTransactionAt = new Date();
    const watermark = '2026-09-11T07:00:00.000Z';
    const recoveredAt = new Date('2026-09-11T06:30:00.000Z');
    const { service, prisma } = createService([{
      id: 'integration-bank', kind: 'OPEN_BANKING', provider: 'TESTBANK', status: 'CONNECTED', authType: 'OAUTH2',
      metadata: { bankTransactionWatermark: watermark, bankTransactionOverlapHours: 48 },
      consentExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      lastSyncAt: new Date(), lastError: null, hasCredentials: true,
      lastSyncStatus: 'SUCCESS', lastSyncCompletedAt: new Date(),
      activeRunId: null, activeRunStartedAt: null, activeRunHeartbeatAt: null,
      syncSuccess24h: 4, syncFailure24h: 1, staleRecovered24h: 1, lastRecoveredAt: recoveredAt,
      avgSyncDurationMs24h: 1500,
      activeAccountCount: 3,
      inactiveAccountCount: 1,
      latestBalanceAsOf,
      currentBalancesByCurrency: { TRY: '1250.50', USD: '100.00' },
      latestBankTransactionAt: latestTransactionAt,
      unmatchedBankTransactionCount: 4,
    }]);

    const result = await service.get('integration-bank');

    expect(result.healthy).toBe(true);
    expect(result.consent.expired).toBe(false);
    expect(result.runtimeReady).toBe(true);
    expect(result.sync.stale).toBe(false);
    expect(result.sync.activeRun).toBeNull();
    expect(result.observability).toMatchObject({
      attempts: 5,
      successes: 4,
      failures: 1,
      successRate: 80,
      averageDurationMs: 1500,
      staleRecoveries: 1,
      lastRecoveredAt: recoveredAt,
    });
    expect(result.banking).toEqual({
      activeAccountCount: 3,
      inactiveAccountCount: 1,
      latestBalanceAsOf,
      currentBalancesByCurrency: { TRY: '1250.50', USD: '100.00' },
      latestTransactionAt,
      unmatchedTransactionCount: 4,
      transactionWatermark: new Date(watermark),
      transactionOverlapHours: 48,
    });
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('i.tenant_id=$2::text');
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('jsonb_object_agg');
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('heartbeat_at');
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('recovered_at');
    expect(prisma.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      'integration-bank', 'tenant-a', 'company-a', 'branch-a',
    ]);
  });

  it('treats a fresh running sync as healthy and exposes its heartbeat', async () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 1000);
    const heartbeatAt = new Date(Date.now() - 30 * 1000);
    const { service } = createService([{
      id: 'integration-bank', kind: 'OPEN_BANKING', provider: 'TESTBANK', status: 'CONNECTED', authType: 'API_KEY',
      metadata: {}, consentExpiresAt: null, lastSyncAt: new Date(), lastError: null, hasCredentials: true,
      lastSyncStatus: 'RUNNING', lastSyncCompletedAt: null,
      activeRunId: 'run-1', activeRunStartedAt: startedAt, activeRunHeartbeatAt: heartbeatAt,
    }]);

    const result = await service.get('integration-bank');

    expect(result.healthy).toBe(true);
    expect(result.sync.activeRun).toEqual({
      id: 'run-1',
      startedAt,
      heartbeatAt,
      stale: false,
      staleAfterMinutes: 30,
    });
  });

  it('marks an active run unhealthy when its heartbeat is stale', async () => {
    const staleHeartbeat = new Date(Date.now() - 31 * 60 * 1000);
    const { service } = createService([{
      id: 'integration-bank', kind: 'OPEN_BANKING', provider: 'TESTBANK', status: 'CONNECTED', authType: 'API_KEY',
      metadata: {}, consentExpiresAt: null, lastSyncAt: new Date(), lastError: null, hasCredentials: true,
      lastSyncStatus: 'RUNNING', lastSyncCompletedAt: null,
      activeRunId: 'run-stale', activeRunStartedAt: staleHeartbeat, activeRunHeartbeatAt: staleHeartbeat,
    }]);

    const result = await service.get('integration-bank');

    expect(result.healthy).toBe(false);
    expect(result.sync.activeRun?.stale).toBe(true);
  });

  it('marks expired consent as unhealthy', async () => {
    const { service } = createService([{
      id: 'integration-bank', kind: 'OPEN_BANKING', provider: 'TESTBANK', status: 'CONNECTED', authType: 'OAUTH2',
      metadata: {}, consentExpiresAt: new Date(Date.now() - 60_000),
      lastSyncAt: null, lastError: 'OPEN_BANKING_CONSENT_EXPIRED', hasCredentials: true,
      lastSyncStatus: null, lastSyncCompletedAt: null,
      activeRunId: null,
    }]);

    const result = await service.get('integration-bank');
    expect(result.healthy).toBe(false);
    expect(result.consent.expired).toBe(true);
  });

  it('reports stale sync separately without fabricating a connection failure', async () => {
    const { service } = createService([{
      id: 'integration-bank', kind: 'OPEN_BANKING', provider: 'TESTBANK', status: 'CONNECTED', authType: 'API_KEY',
      metadata: {}, consentExpiresAt: null,
      lastSyncAt: new Date(Date.now() - 25 * 60 * 60 * 1000), lastError: null, hasCredentials: true,
      lastSyncStatus: 'SUCCESS', lastSyncCompletedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      activeRunId: null,
    }]);

    const result = await service.get('integration-bank');
    expect(result.healthy).toBe(true);
    expect(result.sync.stale).toBe(true);
    expect(result.sync.staleAfterHours).toBe(24);
  });

  it('does not leak existence outside active scope', async () => {
    const { service } = createService([]);
    await expect(service.get('integration-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
