import { CrmAutomationSchedulerService } from './crm-automation-scheduler.service';

describe('CrmAutomationSchedulerService', () => {
  function createService(ownsLease: boolean) {
    const query = jest.fn().mockImplementation(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('INSERT INTO crm_automation_scheduler_leases')) {
        return ownsLease ? [{ ownerToken: args[1] }] : [];
      }
      if (sql.includes('WITH event_candidates AS')) {
        return [
          { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
        ];
      }
      return [];
    });
    const execute = jest.fn().mockResolvedValue(1);
    const processPendingEvents = jest
      .fn()
      .mockResolvedValue({ scanned: 2, created: 1, skipped: 1 });
    const runStaleOpportunitySweep = jest.fn().mockResolvedValue({
      scanned: 1,
      created: 1,
      skipped: 0,
      staleDays: 9,
      staleBefore: new Date(),
    });

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
    const { service, processPendingEvents, runStaleOpportunitySweep } =
      createService(false);

    await (service as any).run();

    expect(processPendingEvents).not.toHaveBeenCalled();
    expect(runStaleOpportunitySweep).not.toHaveBeenCalled();
  });

  it('discovers configured stale scopes, processes them, and releases its lease', async () => {
    const { service, query, execute, processPendingEvents, runStaleOpportunitySweep } =
      createService(true);

    await (service as any).run();

    const scope = {
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
    };
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("r.rule_key='STALE_OPPORTUNITY_FOLLOW_UP'"),
    );
    expect(processPendingEvents).toHaveBeenCalledWith(scope);
    expect(runStaleOpportunitySweep).toHaveBeenCalledWith(scope);

    const releaseCall = execute.mock.calls.find((call) =>
      String(call[0]).includes('DELETE FROM crm_automation_scheduler_leases'),
    );
    expect(releaseCall).toBeDefined();
    expect(releaseCall?.[1]).toBe('crm-automation-runtime');
    expect(typeof releaseCall?.[2]).toBe('string');
    expect(releaseCall?.[2]).toHaveLength(36);
  });
});
