import { CrmAutomationSchedulerService } from './crm-automation-scheduler.service';

describe('CrmAutomationSchedulerService', () => {
  function createService(ownsLease: boolean) {
    const query = jest.fn();
    const execute = jest.fn().mockResolvedValue(1);
    const processPendingEvents = jest.fn().mockResolvedValue({ scanned: 2, created: 1, skipped: 1 });
    const runStaleOpportunitySweep = jest.fn().mockResolvedValue({
      scanned: 1,
      created: 1,
      skipped: 0,
      staleDays: 14,
      staleBefore: new Date(),
    });

    query
      .mockResolvedValueOnce(ownsLease ? [{ ownerToken: expect.any(String) }] : [])
      .mockResolvedValueOnce([
        { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
      ]);

    if (ownsLease) {
      query.mockImplementationOnce(async (_sql: string, _key: string, ownerToken: string) => [
        { ownerToken },
      ]);
      query.mockResolvedValueOnce([
        { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
      ]);
    }

    const service = new CrmAutomationSchedulerService(
      { $queryRawUnsafe: query, $executeRawUnsafe: execute } as never,
      { processPendingEvents, runStaleOpportunitySweep } as never,
    );
    return {
      service,
      query,
      execute,
      processPendingEvents,
      runStaleOpportunitySweep,
    };
  }

  it('does not process scopes when another instance owns the lease', async () => {
    const { service, processPendingEvents, runStaleOpportunitySweep } = createService(false);

    await (service as any).run();

    expect(processPendingEvents).not.toHaveBeenCalled();
    expect(runStaleOpportunitySweep).not.toHaveBeenCalled();
  });

  it('processes discovered scopes and releases its lease', async () => {
    const { service, execute, processPendingEvents, runStaleOpportunitySweep } = createService(true);

    await (service as any).run();

    const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
    expect(processPendingEvents).toHaveBeenCalledWith(scope);
    expect(runStaleOpportunitySweep).toHaveBeenCalledWith(scope, 14);

    const releaseCall = execute.mock.calls.find((call) =>
      String(call[0]).includes('DELETE FROM crm_automation_scheduler_leases'),
    );
    expect(releaseCall).toBeDefined();
    expect(releaseCall?.[1]).toBe('crm-automation-runtime');
    expect(typeof releaseCall?.[2]).toBe('string');
    expect(releaseCall?.[2]).toHaveLength(36);
  });
});
