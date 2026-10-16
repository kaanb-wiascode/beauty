import { FinancialIntegrationAlertsService } from './financial-integration-alerts.service';

describe('FinancialIntegrationAlertsService', () => {
  function health(overrides: Record<string, any> = {}) {
    return {
      adapterAvailable: true,
      hasCredentials: true,
      consent: { expired: false, expiringSoon: false },
      sync: { stale: false, activeRun: null },
      observability: { attempts: 10, failures: 0, staleRecoveries: 0 },
      banking: { unmatchedTransactionCount: 0 },
      pos: null,
      ...overrides,
    };
  }

  it('returns healthy when no production threshold is breached', async () => {
    const dependency = { get: jest.fn().mockResolvedValue(health()) } as never;
    const service = new FinancialIntegrationAlertsService(dependency);

    const result = await service.get('integration-a');

    expect(result.state).toBe('HEALTHY');
    expect(result.alerts).toEqual([]);
    expect(result.thresholds.criticalFailureRatePercent).toBe(50);
  });

  it('raises critical alert for stale active run and high failure rate', async () => {
    const dependency = {
      get: jest.fn().mockResolvedValue(
        health({
          sync: { stale: false, activeRun: { stale: true } },
          observability: { attempts: 4, failures: 2, staleRecoveries: 1 },
        }),
      ),
    } as never;
    const service = new FinancialIntegrationAlertsService(dependency);

    const result = await service.get('integration-a');

    expect(result.state).toBe('CRITICAL');
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SYNC_RUN_STALE', severity: 'CRITICAL' }),
        expect.objectContaining({ code: 'SYNC_FAILURE_RATE_CRITICAL', severity: 'CRITICAL' }),
        expect.objectContaining({ code: 'STALE_SYNC_RECOVERED', severity: 'WARNING' }),
      ]),
    );
  });

  it('warns when unmatched bank transactions exceed the threshold', async () => {
    const dependency = {
      get: jest.fn().mockResolvedValue(
        health({ banking: { unmatchedTransactionCount: 25 } }),
      ),
    } as never;
    const service = new FinancialIntegrationAlertsService(dependency);

    const result = await service.get('integration-a');

    expect(result.state).toBe('WARNING');
    expect(result.alerts[0]).toMatchObject({
      code: 'UNMATCHED_BANK_TRANSACTIONS_HIGH',
    });
  });

  it('raises a critical alert when a POS refund requires manual review', async () => {
    const dependency = {
      get: jest.fn().mockResolvedValue(
        health({
          banking: null,
          pos: { refundReviewRequiredCount: 2 },
        }),
      ),
    } as never;
    const service = new FinancialIntegrationAlertsService(dependency);

    const result = await service.get('integration-pos');

    expect(result.state).toBe('CRITICAL');
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'POS_REFUND_REVIEW_REQUIRED',
          severity: 'CRITICAL',
        }),
      ]),
    );
  });
});
