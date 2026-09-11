import { FinancialIntegrationSyncSchedulerService } from './financial-integration-sync-scheduler.service';

describe('FinancialIntegrationSyncSchedulerService', () => {
  function createService(queryResult: Array<{ ownerToken: string }> = []) {
    const syncAllConnected = jest.fn().mockResolvedValue([]);
    const query = jest.fn().mockImplementation(async (_sql: string, _key: string, ownerToken: string) => {
      if (queryResult.length) return [{ ownerToken }];
      return [];
    });
    const execute = jest.fn().mockResolvedValue(1);
    const service = new FinancialIntegrationSyncSchedulerService(
      { syncAllConnected } as never,
      { $queryRawUnsafe: query, $executeRawUnsafe: execute } as never,
    );
    return { service, syncAllConnected, query, execute };
  }

  it('skips synchronization when another instance owns the distributed lease', async () => {
    const { service, syncAllConnected, execute } = createService([]);

    await (service as any).run();

    expect(syncAllConnected).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM finance_scheduler_leases'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('runs synchronization and releases only the lease it owns', async () => {
    const { service, syncAllConnected, execute } = createService([{ ownerToken: 'owned' }]);

    await (service as any).run();

    expect(syncAllConnected).toHaveBeenCalledTimes(1);
    const releaseCall = execute.mock.calls.find((call) => String(call[0]).includes('DELETE FROM finance_scheduler_leases'));
    expect(releaseCall).toBeDefined();
    expect(releaseCall?.[1]).toBe('financial-integration-sync');
    expect(typeof releaseCall?.[2]).toBe('string');
    expect(releaseCall?.[2]).toHaveLength(36);
  });
});
