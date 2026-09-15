import { ReportsService } from './reports.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  roleScope: 'BRANCH' as const,
};

function createService() {
  const prisma = {
    rolePermission: {
      findMany: jest.fn().mockResolvedValue([
        { permission: { resource: 'reports', action: 'read' } },
        { permission: { resource: 'staff', action: 'read' } },
      ]),
    },
  } as any;
  const staff = {
    performance: jest.fn().mockResolvedValue([
      {
        id: 'staff-1',
        name: 'Ada Yılmaz',
        status: 'ACTIVE',
        branchId: 'branch-1',
        appointmentCount: 2,
        completedAppointments: 1,
        collected: 750,
      },
    ]),
  } as any;
  const services = {} as any;
  const payments = {} as any;
  const exports = {} as any;

  return new ReportsService(prisma, staff, services, payments, exports);
}

describe('ReportsService drilldown row identity', () => {
  it('adds server-owned _rowId to drillable previews', async () => {
    const service = createService();

    const result = await service.preview(user, {
      reportKey: 'staff.performance',
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
      },
      columns: ['name', 'collected'],
      sort: { key: 'collected', direction: 'desc' },
      page: 1,
      limit: 25,
    });

    expect(result.report).toEqual(
      expect.objectContaining({ drilldowns: ['appointments'] }),
    );
    expect(result.data).toEqual([
      { name: 'Ada Yılmaz', collected: 750, _rowId: 'staff-1' },
    ]);
    expect(result.columns).toEqual(['name', 'collected']);
  });

  it('never adds _rowId to export materialization', async () => {
    const service = createService();

    const result = await service.materializeExport(user, {
      reportKey: 'staff.performance',
      format: 'CSV',
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
      },
      columns: ['name', 'collected'],
      columnMode: 'VISIBLE',
      sort: { key: 'collected', direction: 'desc' },
      includeSummary: true,
      includeCharts: false,
    });

    expect(result.rows).toEqual([{ name: 'Ada Yılmaz', collected: 750 }]);
    expect(result.rows[0]).not.toHaveProperty('_rowId');
    expect(result.columns).toEqual(['name', 'collected']);
  });
});
