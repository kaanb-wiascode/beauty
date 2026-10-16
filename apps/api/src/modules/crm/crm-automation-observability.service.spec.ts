import { CrmAutomationObservabilityService } from './crm-automation-observability.service';

describe('CrmAutomationObservabilityService', () => {
  const scope = {
    tenantId: 'tenant-1',
    companyId: 'company-1',
    branchId: 'branch-1',
  };

  function makeService() {
    const execute = jest.fn().mockResolvedValue(1);
    const query = jest.fn();
    const service = new CrmAutomationObservabilityService({
      $executeRawUnsafe: execute,
      $queryRawUnsafe: query,
    } as never);
    return { service, execute, query };
  }

  it('persists a successful run with returned metrics', async () => {
    const { service, execute } = makeService();
    const result = { scanned: 4, created: 2, skipped: 2, staleDays: 14 };

    await expect(
      service.execute(
        scope,
        { origin: 'MANUAL', operation: 'STALE_SWEEP', initiatedByUserId: 'actor-1' },
        async () => result,
      ),
    ).resolves.toEqual(result);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_automation_runs'),
      'tenant-1',
      'company-1',
      'branch-1',
      'MANUAL',
      'STALE_SWEEP',
      'SUCCEEDED',
      4,
      2,
      2,
      0,
      expect.stringContaining('"staleDays":14'),
      null,
      'actor-1',
      expect.any(Date),
    );
  });

  it('records a failed run then rethrows the original error', async () => {
    const { service, execute } = makeService();
    const failure = new Error('processor exploded');

    await expect(
      service.execute(
        scope,
        { origin: 'SCHEDULER', operation: 'EVENT_PROCESSOR' },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_automation_runs'),
      'tenant-1',
      'company-1',
      'branch-1',
      'SCHEDULER',
      'EVENT_PROCESSOR',
      'FAILED',
      0,
      0,
      0,
      1,
      '{}',
      'processor exploded',
      null,
      expect.any(Date),
    );
  });

  it('returns scoped dashboard aggregates, runs, rule activity and changes', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([{ runs7d: 8, created7d: 5, failed7d: 1 }])
      .mockResolvedValueOnce([{ id: 'run-1', status: 'SUCCEEDED' }])
      .mockResolvedValueOnce([
        { ruleKey: 'LEAD_FIRST_TOUCH', lastActivityAt: new Date(), executions7d: 3 },
      ])
      .mockResolvedValueOnce([{ eventId: 'event-1', ruleKey: 'LEAD_FIRST_TOUCH' }]);

    const dashboard = await service.getDashboard(scope, 20);

    expect(dashboard.summary).toEqual({ runs7d: 8, created7d: 5, failed7d: 1 });
    expect(dashboard.latestRuns).toHaveLength(1);
    expect(dashboard.ruleActivity).toHaveLength(1);
    expect(dashboard.ruleChanges).toHaveLength(1);
    for (const call of query.mock.calls) {
      expect(call).toEqual(expect.arrayContaining(['tenant-1', 'company-1', 'branch-1']));
    }
  });
});
