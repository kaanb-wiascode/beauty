import { ReportExportWorkerRunnerService } from './report-export-worker-runner.service';

function createRunner(configValues: Record<string, string | undefined> = {}) {
  const processor = {
    processNext: jest.fn(),
  } as any;
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as any;

  return {
    processor,
    runner: new ReportExportWorkerRunnerService(processor, config),
  };
}

describe('ReportExportWorkerRunnerService', () => {
  it('processes only the configured bounded batch size', async () => {
    const { runner, processor } = createRunner({
      REPORT_EXPORT_WORKER_BATCH_SIZE: '2',
    });
    processor.processNext
      .mockResolvedValueOnce({ id: 'export-1' })
      .mockResolvedValueOnce({ id: 'export-2' })
      .mockResolvedValueOnce({ id: 'export-3' });

    await expect(runner.tick()).resolves.toBe(2);
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

  it('contains processor failures without leaking them through the runner', async () => {
    const { runner, processor } = createRunner();
    processor.processNext.mockRejectedValueOnce(new Error('sensitive failure'));

    await expect(runner.tick()).resolves.toBe(0);
  });
});
