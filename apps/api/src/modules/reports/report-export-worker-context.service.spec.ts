import { TenantContext } from '../../common/tenant/tenant-context';
import { ReportExportWorkerContextService } from './report-export-worker-context.service';
import { ReportsService } from './reports.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  roleScope: 'BRANCH' as const,
};

const input = {
  reportKey: 'staff.performance' as const,
  format: 'CSV' as const,
  filters: {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T23:59:59.999Z'),
  },
  columns: ['name', 'collected'],
  includeSummary: true,
  includeCharts: false,
};

describe('ReportExportWorkerContextService', () => {
  it('initializes an isolated tenant context before resolving report services', async () => {
    const tenantContext = { setContext: jest.fn() };
    const reportsService = {
      materializeExport: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const moduleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn(async (token: unknown) => {
        if (token === TenantContext) return tenantContext;
        if (token === ReportsService) return reportsService;
        throw new Error('Unexpected token');
      }),
    } as any;

    const service = new ReportExportWorkerContextService(moduleRef);
    await service.materialize(user, input);

    expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith(
      expect.objectContaining({ user, reportExportWorker: true }),
      expect.anything(),
    );
    expect(tenantContext.setContext).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    });
    expect(reportsService.materializeExport).toHaveBeenCalledWith(user, input);

    const tenantResolveOrder = moduleRef.resolve.mock.calls.findIndex(
      ([token]: [unknown]) => token === TenantContext,
    );
    const reportsResolveOrder = moduleRef.resolve.mock.calls.findIndex(
      ([token]: [unknown]) => token === ReportsService,
    );
    expect(tenantResolveOrder).toBeGreaterThanOrEqual(0);
    expect(reportsResolveOrder).toBeGreaterThan(tenantResolveOrder);
  });
});
