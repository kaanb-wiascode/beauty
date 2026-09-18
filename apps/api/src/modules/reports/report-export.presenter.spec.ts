import {
  toPublicReportExportJob,
  toPublicReportExportList,
} from './report-export.presenter';

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
  format: 'PDF',
  status: 'READY',
  filters: { from: '2026-09-01', to: '2026-09-30' },
  columns: ['name', 'collected'],
  sort: null,
  includeSummary: true,
  includeCharts: false,
  rowCount: 2,
  storageKey: 'tenants/tenant-1/report-exports/export-1/file.pdf',
  errorCode: null,
  errorSummary: null,
  requestedAt: new Date('2026-09-15T10:00:00.000Z'),
  startedAt: new Date('2026-09-15T10:00:01.000Z'),
  completedAt: new Date('2026-09-15T10:00:02.000Z'),
  expiresAt: new Date('2026-09-22T10:00:02.000Z'),
  updatedAt: new Date('2026-09-15T10:00:02.000Z'),
} as any;

describe('report export public presenter', () => {
  it('exposes only the public export job contract', () => {
    const presented = toPublicReportExportJob(job);

    expect(presented).toEqual(
      expect.objectContaining({
        id: 'export-1',
        reportKey: 'staff.performance',
        format: 'PDF',
        status: 'READY',
        rowCount: 2,
      }),
    );

    for (const internalKey of [
      'tenantId',
      'companyId',
      'branchId',
      'roleScope',
      'membershipId',
      'roleId',
      'requestedBy',
      'storageKey',
      'filters',
      'columns',
      'sort',
    ]) {
      expect(presented).not.toHaveProperty(internalKey);
    }
  });

  it('applies the same public projection to paginated history', () => {
    const presented = toPublicReportExportList({
      data: [job],
      meta: { page: 1, limit: 8, total: 1, totalPages: 1 },
    });

    expect(presented.meta).toEqual({ page: 1, limit: 8, total: 1, totalPages: 1 });
    expect(presented.data).toHaveLength(1);
    expect(presented.data[0]).not.toHaveProperty('storageKey');
    expect(presented.data[0]).not.toHaveProperty('requestedBy');
  });
});
