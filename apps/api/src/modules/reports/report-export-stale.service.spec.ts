import { ReportExportStaleService } from './report-export-stale.service';

describe('ReportExportStaleService', () => {
  const now = new Date('2026-09-15T16:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fails processing jobs older than the configured threshold', async () => {
    const repository = {
      failStale: jest.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]),
    } as any;
    const service = new ReportExportStaleService(repository);

    await expect(service.recover(45, 25)).resolves.toEqual({ failed: 2 });
    expect(repository.failStale).toHaveBeenCalledWith(
      new Date('2026-09-15T15:15:00.000Z'),
      25,
    );
  });

  it('falls back to bounded defaults for unsafe values', async () => {
    const repository = {
      failStale: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new ReportExportStaleService(repository);

    await service.recover(1, 10_000);

    expect(repository.failStale).toHaveBeenCalledWith(
      new Date('2026-09-15T15:30:00.000Z'),
      100,
    );
  });
});
