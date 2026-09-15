import { PlatformTenantHealthService } from './platform-tenant-health.service';

describe('PlatformTenantHealthService', () => {
  const tx = {
    $queryRaw: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    $queryRaw: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const service = new PlatformTenantHealthService(prisma as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();
    audit.record.mockResolvedValue(undefined);
  });

  it('produces a healthy score only when all factual platform signals are healthy', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'tenant-1' }])
      .mockResolvedValueOnce([{ state: 'ACTIVE' }])
      .mockResolvedValueOnce([{ status: 'ACTIVE' }])
      .mockResolvedValueOnce([{ status: 'COMPLETED' }])
      .mockResolvedValueOnce([{ active: true }])
      .mockResolvedValueOnce([
        {
          status: 'COMPLETED',
          requiredCount: 9n,
          completedRequiredCount: 9n,
          blockedCount: 0n,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'health-1',
          tenantId: 'tenant-1',
          totalScore: 100,
          lifecycleScore: 20,
          subscriptionScore: 20,
          provisioningScore: 20,
          ownerAccessScore: 20,
          onboardingScore: 20,
          riskBand: 'HEALTHY',
          reasons: [],
          calculatedByPlatformUserId: 'actor-1',
          calculatedAt: new Date('2026-09-16T00:00:00.000Z'),
        },
      ]);

    const result = await service.recalculate(
      'tenant-1',
      'actor-1',
      'Scheduled success review',
      'request-1',
    );

    expect(result).toMatchObject({ totalScore: 100, riskBand: 'HEALTHY' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'tenant_health',
        action: 'snapshot.recalculate',
        targetTenantId: 'tenant-1',
        reason: 'Scheduled success review',
        correlationId: 'request-1',
      }),
      tx,
    );
  });

  it('scores restricted lifecycle, past-due subscription and blocked onboarding as risk signals', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'tenant-1' }])
      .mockResolvedValueOnce([{ state: 'RESTRICTED' }])
      .mockResolvedValueOnce([{ status: 'PAST_DUE' }])
      .mockResolvedValueOnce([{ status: 'FAILED' }])
      .mockResolvedValueOnce([{ active: false }])
      .mockResolvedValueOnce([
        {
          status: 'BLOCKED',
          requiredCount: 10n,
          completedRequiredCount: 5n,
          blockedCount: 1n,
        },
      ])
      .mockImplementationOnce(async () => [
        {
          id: 'health-2',
          tenantId: 'tenant-1',
          totalScore: 22,
          lifecycleScore: 8,
          subscriptionScore: 6,
          provisioningScore: 0,
          ownerAccessScore: 0,
          onboardingScore: 8,
          riskBand: 'CRITICAL',
          reasons: [
            'LIFECYCLE_RESTRICTED',
            'SUBSCRIPTION_PAST_DUE',
            'PROVISIONING_FAILED',
            'OWNER_ACCESS_MISSING',
            'ONBOARDING_BLOCKED',
          ],
          calculatedByPlatformUserId: 'actor-1',
          calculatedAt: new Date(),
        },
      ]);

    const result = await service.recalculate('tenant-1', 'actor-1', 'Risk review');

    expect(result).toMatchObject({ totalScore: 22, riskBand: 'CRITICAL' });
  });
});
