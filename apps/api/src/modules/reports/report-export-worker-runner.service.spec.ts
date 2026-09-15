import { ReportExportWorkerRunnerService } from './report-export-worker-runner.service';

function createRunner(configValues: Record<string, string | undefined> = {}) {
  const processor = {
    processNext: jest.fn(),
  } as any;
  const expiry = {
    cleanup: jest.fn().mockResolvedValue({ expired: 0, deleted: 0 }),
  } as any;
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as any;

  return {
    processor,
    expiry,
    runner: new ReportExportWorkerRunnerService(processor, expiry, config),
  };
}

describe('ReportExportWorkerRunnerService', () => {
  it('runs expiry cleanup before processing a bounded batch', async () => {
    const { runner, processor, expiry } = createRunner({
      REPORT_EXPORT_WORKER_BATCH_SIZE: '2',
      REPORT_EXPORT_EXPIRY_BATCH_SIZE: '50',
    });
    processor.processNext
      .mockResolvedValueOnce({ id: 'export-1' })
      .mockResolvedValueOnce({ id: 'export-2' })
      .mockResolvedValueOnce({ id: 'export-3' });

    await expect(runner.tick()).resolves.toBe(2);
    expect(expiry.cleanup).toHaveBeenCalledWith(50);
    expect(processor.processNext).toHaveBeenCalledTimes(2);
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

  it('contains cleanup or processor failures without leaking them through the runner', async () => {
    const { runner, expiry, processor } = createRunner();
    expiry.cleanup.mockRejectedValueOnce(new Error('sensitive cleanup failure'));

    await expect(runner.tick()).resolves.toBe(0);
    expect(processor.processNext).not.toHaveBeenCalled();
  });
});
