import {
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';

import { ReportExportDownloadService } from './report-export-download.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  roleScope: 'BRANCH' as const,
};

const readyJob = {
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
  status: 'READY',
  filters: {
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.999Z',
  },
  columns: ['name', 'collected'],
  sort: null,
  includeSummary: true,
  includeCharts: false,
  rowCount: 1,
  storageKey: 'tenants/tenant-1/report-exports/export-1/file.csv',
  errorCode: null,
  errorSummary: null,
  requestedAt: new Date(),
  startedAt: new Date(),
  completedAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  updatedAt: new Date(),
};

function createService() {
  const jobs = {
    findById: jest.fn().mockResolvedValue(readyJob),
  } as any;
  const reports = {
    prepareExport: jest.fn().mockResolvedValue({}),
  } as any;
  const storage = {
    read: jest.fn().mockResolvedValue(Buffer.from('csv-content')),
  } as any;

  return {
    jobs,
    reports,
    storage,
    service: new ReportExportDownloadService(jobs, reports, storage),
  };
}

describe('ReportExportDownloadService', () => {
  it('revalidates current permissions before reading a ready artifact', async () => {
    const { service, reports, storage } = createService();

    const artifact = await service.download(user, 'export-1');

    expect(reports.prepareExport).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        reportKey: 'staff.performance',
        format: 'CSV',
        columns: ['name', 'collected'],
      }),
    );
    expect(storage.read).toHaveBeenCalledWith(readyJob.storageKey);
    expect(artifact).toEqual({
      content: Buffer.from('csv-content'),
      contentType: 'text/csv; charset=utf-8',
      fileName: 'staff.performance-export-1.csv',
    });
  });

  it('does not allow another user in the same scope to download the artifact', async () => {
    const { service, storage } = createService();

    await expect(
      service.download({ ...user, sub: 'user-2' }, 'export-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('does not expose an artifact before it is ready', async () => {
    const { service, jobs, storage } = createService();
    jobs.findById.mockResolvedValueOnce({
      ...readyJob,
      status: 'PROCESSING',
      storageKey: null,
    });

    await expect(service.download(user, 'export-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('returns gone for an expired artifact', async () => {
    const { service, jobs, storage } = createService();
    jobs.findById.mockResolvedValueOnce({
      ...readyJob,
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(service.download(user, 'export-1')).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('does not read storage when current report permission was revoked', async () => {
    const { service, reports, storage } = createService();
    reports.prepareExport.mockRejectedValueOnce(
      new ForbiddenException('permission revoked'),
    );

    await expect(service.download(user, 'export-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storage.read).not.toHaveBeenCalled();
  });
});
