import { ReportExportWorkerRunnerService } from './report-export-worker-runner.service';

describe('ReportExportWorkerRunnerService scheduled reports', () => {
  it('queues due schedules before consuming export jobs', async () => {
    const order: string[] = [];
    const processor = {
      processNext: jest.fn().mockImplementation(async () => {
        order.push('export');
        return null;
      }),
    } as any;
    const expiry = {
      cleanup: jest.fn().mockImplementation(async () => {
        order.push('expiry');
        return { expired: 0, deleted: 0 };
      }),
    } as any;
    const stale = {
      recover: jest.fn().mockImplementation(async () => {
        order.push('stale');
        return { failed: 0 };
      }),
    } as any;
    const config = {
      get: jest.fn((key: string) =>
        key === 'REPORT_SCHEDULE_BATCH_SIZE' ? '2' : undefined,
      ),
    } as any;
    const schedules = {
      processNext: jest
        .fn()
        .mockImplementationOnce(async () => {
          order.push('schedule');
          return { runId: 'run-1', status: 'QUEUED' };
        })
        .mockResolvedValueOnce(null),
    } as any;

    const runner = new ReportExportWorkerRunnerService(
      processor,
      expiry,
      stale,
      config,
      schedules,
    );

    await expect(runner.tick()).resolves.toBe(0);
    expect(schedules.processNext).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['stale', 'expiry', 'schedule', 'export']);
  });
});
