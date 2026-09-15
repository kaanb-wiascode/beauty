import { ForbiddenException } from '@nestjs/common';

import { ReportExportProcessorService } from './report-export-processor.service';

const storageKey = 'tenants/tenant-1/report-exports/export-1/file.csv';

const job = {
  id: 'export-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  roleScope: 'BRANCH',
  membershipId: 'membership-1',
  roleId: 'role-1',
  requestedBy: 'user-1',
  reportKey: 'staff.performance',
  format: 'CSV',
  status: 'PROCESSING',
  filters: {
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.999Z',
  },
  columns: ['name', 'collected'],
  sort: { key: 'collected', direction: 'desc' },
  includeSummary: true,
  includeCharts: false,
  rowCount: null,
  storageKey: null,
  errorCode: null,
  errorSummary: null,
  requestedAt: new Date(),
  startedAt: new Date(),
  completedAt: null,
  expiresAt: null,
  updatedAt: new Date(),
} as const;

function createProcessor() {
  const jobs = {
    claimNextQueued: jest.fn().mockResolvedValue(job),
    findById: jest.fn().mockResolvedValue(job),
    markReady: jest.fn().mockResolvedValue({ ...job, status: 'READY' }),
    markFailed: jest.fn().mockResolvedValue({ ...job, status: 'FAILED' }),
  } as any;
  const authorization = {
    validate: jest.fn().mockResolvedValue({
      sub: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    }),
  } as any;
  const workerContext = {
    materialize: jest.fn().mockResolvedValue({
      columns: ['name', 'collected'],
      rows: [{ name: 'Ada Yılmaz', collected: 1250 }],
      summary: { rowCount: 1 },
    }),
  } as any;
  const csv = {
    generate: jest.fn().mockReturnValue('\uFEFFname,collected\r\nAda Yılmaz,1250\r\n'),
  } as any;
  const storage = {
    write: jest.fn().mockResolvedValue(storageKey),
    delete: jest.fn().mockResolvedValue(undefined),
  } as any;
  const config = {
    get: jest.fn().mockReturnValue('14'),
  } as any;

  return {
    jobs,
    authorization,
    workerContext,
    csv,
    storage,
    processor: new ReportExportProcessorService(
      jobs,
      authorization,
      workerContext,
      csv,
      storage,
      config,
    ),
  };
}

describe('ReportExportProcessorService', () => {
  it('claims, revalidates, materializes and completes a CSV job', async () => {
    const { processor, jobs, workerContext, storage } = createProcessor();

    await processor.processNext();

    expect(workerContext.materialize).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', branchId: 'branch-1' }),
      expect.objectContaining({ reportKey: 'staff.performance', format: 'CSV' }),
    );
    expect(storage.write).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        jobId: 'export-1',
        extension: 'csv',
      }),
    );
    expect(jobs.markReady).toHaveBeenCalledWith(
      'export-1',
      expect.objectContaining({
        rowCount: 1,
        storageKey,
        expiresAt: expect.any(Date),
      }),
    );
    expect(jobs.markFailed).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes the exact uploaded artifact when READY transition fails before commit', async () => {
    const { processor, jobs, storage } = createProcessor();
    jobs.markReady.mockRejectedValueOnce(new Error('database unavailable'));
    jobs.findById.mockResolvedValueOnce(job);

    await processor.processNext();

    expect(jobs.findById).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', companyId: 'company-1' }),
      'export-1',
    );
    expect(storage.delete).toHaveBeenCalledWith(storageKey);
    expect(jobs.markFailed).toHaveBeenCalledWith('export-1', {
      errorCode: 'EXPORT_GENERATION_FAILED',
      errorSummary: 'The export could not be generated.',
    });
  });

  it('preserves the artifact when READY committed but acknowledgement failed', async () => {
    const { processor, jobs, storage } = createProcessor();
    const persistedReady = {
      ...job,
      status: 'READY',
      storageKey,
      rowCount: 1,
      completedAt: new Date(),
      expiresAt: new Date(),
    };
    jobs.markReady.mockRejectedValueOnce(new Error('connection reset after commit'));
    jobs.findById.mockResolvedValueOnce(persistedReady);

    await expect(processor.processNext()).resolves.toEqual(persistedReady);

    expect(storage.delete).not.toHaveBeenCalled();
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it('keeps the primary transition failure when orphan cleanup also fails', async () => {
    const { processor, jobs, storage } = createProcessor();
    jobs.markReady.mockRejectedValueOnce(new Error('database unavailable'));
    jobs.findById.mockResolvedValueOnce(job);
    storage.delete.mockRejectedValueOnce(new Error('storage unavailable'));

    await processor.processNext();

    expect(storage.delete).toHaveBeenCalledWith(storageKey);
    expect(jobs.markFailed).toHaveBeenCalledWith('export-1', {
      errorCode: 'EXPORT_GENERATION_FAILED',
      errorSummary: 'The export could not be generated.',
    });
  });

  it('does not delete an artifact when persisted state cannot be verified', async () => {
    const { processor, jobs, storage } = createProcessor();
    jobs.markReady.mockRejectedValueOnce(new Error('database unavailable'));
    jobs.findById.mockRejectedValueOnce(new Error('database still unavailable'));

    await processor.processNext();

    expect(storage.delete).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith('export-1', {
      errorCode: 'EXPORT_GENERATION_FAILED',
      errorSummary: 'The export could not be generated.',
    });
  });

  it('fails safely when current authorization was revoked', async () => {
    const { processor, jobs, authorization, workerContext } = createProcessor();
    authorization.validate.mockRejectedValueOnce(
      new ForbiddenException('sensitive internal detail'),
    );

    await processor.processNext();

    expect(workerContext.materialize).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith('export-1', {
      errorCode: 'AUTHORIZATION_REVOKED',
      errorSummary: 'Export authorization is no longer valid.',
    });
  });

  it('does not attempt unimplemented PDF generation', async () => {
    const { processor, jobs, workerContext } = createProcessor();
    jobs.claimNextQueued.mockResolvedValueOnce({ ...job, format: 'PDF' });

    await processor.processNext();

    expect(workerContext.materialize).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith('export-1', {
      errorCode: 'FORMAT_NOT_IMPLEMENTED',
      errorSummary: 'PDF export generation is not available yet.',
    });
  });

  it('rejects tampered stored parameters before materialization', async () => {
    const { processor, jobs, workerContext } = createProcessor();
    jobs.claimNextQueued.mockResolvedValueOnce({
      ...job,
      columns: ['name'],
      sort: { key: 'collected', direction: 'DROP TABLE' },
    });

    await processor.processNext();

    expect(workerContext.materialize).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith('export-1', {
      errorCode: 'INVALID_JOB_PAYLOAD',
      errorSummary: 'Stored export parameters are invalid.',
    });
  });

  it('returns null when there is no queued job', async () => {
    const { processor, jobs } = createProcessor();
    jobs.claimNextQueued.mockResolvedValueOnce(null);

    await expect(processor.processNext()).resolves.toBeNull();
  });
});
