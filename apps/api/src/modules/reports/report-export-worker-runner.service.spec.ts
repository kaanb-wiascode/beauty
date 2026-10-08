import { ReportExportWorkerRunnerService } from './report-export-worker-runner.service';

function createRunner(configValues: Record<string, string | undefined> = {}) {
  const processor = {
    processNext: jest.fn(),
  } as any;
  const expiry = {
    cleanup: jest.fn().mockResolvedValue({ expired: 0, deleted: 0 }),
  } as any;
  const stale = {
    recover: jest.fn().mockResolvedValue({ failed: 0 }),
  } as any;
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as any;

  return {
    processor,
    expiry,
    stale,
    runner: new ReportExportWorkerRunnerService(
      processor,
      expiry,
      stale,
      config,
    ),
  };
}

describe('ReportExportWorkerRunnerService', () => {
  it('recovers stale jobs before expiry cleanup and processing a bounded batch', async () => {
    const { runner, processor, expiry, stale } = createRunner({
      REPORT_EXPORT_WORKER_BATCH_SIZE: '2',
      REPORT_EXPORT_EXPIRY_BATCH_SIZE: '50',
      REPORT_EXPORT_STALE_BATCH_SIZE: '40',
      REPORT_EXPORT_STALE_PROCESSING_MINUTES: '45',
    });
    const order: string[] = [];
    stale.recover.mockImplementation(async () => {
      order.push('stale');
      return { failed: 1 };
    });
    expiry.cleanup.mockImplementation(async () => {
      order.push('expiry');
      return { expired: 0, deleted: 0 };
    });
    processor.processNext
      .mockImplementationOnce(async () => {
        order.push('process');
        return { id: 'export-1' };
      })
      .mockResolvedValueOnce({ id: 'export-2' })
      .mockResolvedValueOnce({ id: 'export-3' });

    await expect(runner.tick()).resolves.toBe(2);
    expect(stale.recover).toHaveBeenCalledWith(45, 40);
    expect(expiry.cleanup).toHaveBeenCalledWith(50);
    expect(processor.processNext).toHaveBeenCalledTimes(2);
    expect(order.slice(0, 3)).toEqual(['stale', 'expiry', 'process']);
  });

  it('stops the batch when no queued job remains', async () => {
    const { runner, processor } = createRunner();
    processor.processNext
      .mockResolvedValueOnce({ id: 'export-1' })
      .mockResolvedValueOnce(null);

    await expect(runner.tick()).resolves.toBe(1);
    expect(processor.processNext).toHaveBeenCalledTimes(2);
  });

  it('does not overlap worker iterations', async () => {
    let release!: () => void;
    const blocked = new Promise((resolve) => {
      release = () => resolve({ id: 'export-1' });
    });
    const { runner, processor } = createRunner();
    processor.processNext.mockReturnValueOnce(blocked).mockResolvedValue(null);

    const first = runner.tick();
    await expect(runner.tick()).resolves.toBe(0);
    release();
    await expect(first).resolves.toBe(1);
  });

  it('contains stale recovery failures and does not process new jobs', async () => {
    const { runner, stale, expiry, processor } = createRunner();
    stale.recover.mockRejectedValueOnce(new Error('sensitive recovery failure'));

    await expect(runner.tick()).resolves.toBe(0);
    expect(expiry.cleanup).not.toHaveBeenCalled();
    expect(processor.processNext).not.toHaveBeenCalled();
  });

  it('contains cleanup failures and does not process new jobs', async () => {
    const { runner, expiry, processor } = createRunner();
    expiry.cleanup.mockRejectedValueOnce(new Error('sensitive cleanup failure'));

    await expect(runner.tick()).resolves.toBe(0);
    expect(processor.processNext).not.toHaveBeenCalled();
  });
});
