import { PrismaService } from '@beauty-erp/database';

import { REQUIRED_PERMISSION_KEY } from '../../common/auth/permissions.decorator';
import { reportDefinitions, reportKeys } from './report-definition';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('reporting foundation', () => {
  const user = {
    roleId: 'role-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
  };

  function createService(
    permissions: Array<{ resource: string; action: string }>,
  ) {
    const prisma = {
      rolePermission: {
        findMany: jest.fn().mockResolvedValue(
          permissions.map((permission) => ({ permission })),
        ),
      },
    } as unknown as PrismaService;

    return {
      prisma,
      service: new ReportsService(prisma),
    };
  }

  it('keeps report definitions server-owned and stable', () => {
    expect(reportDefinitions.map((report) => report.key)).toEqual([
      reportKeys.staffPerformance,
      reportKeys.servicePerformance,
      reportKeys.paymentSummary,
    ]);
  });

  it('returns only reports whose layered permissions are granted', async () => {
    const { service } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
      { resource: 'services', action: 'read' },
    ]);

    const catalog = await service.getCatalog(user);

    expect(catalog.map((report) => report.key)).toEqual([
      reportKeys.staffPerformance,
      reportKeys.servicePerformance,
    ]);
    expect(catalog).not.toContainEqual(
      expect.objectContaining({ key: reportKeys.paymentSummary }),
    );
  });

  it('returns all foundation reports when all required permissions are granted', async () => {
    const { service } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
      { resource: 'services', action: 'read' },
      { resource: 'payments', action: 'read' },
    ]);

    const catalog = await service.getCatalog(user);

    expect(catalog).toEqual(reportDefinitions);
  });

  it('requires reports.read for the catalog endpoint', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        ReportsController.prototype.getCatalog,
      ),
    ).toEqual({ resource: 'reports', action: 'read' });
  });
});
