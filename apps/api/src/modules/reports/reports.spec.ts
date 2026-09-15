import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { REQUIRED_PERMISSION_KEY } from '../../common/auth/permissions.decorator';
import { PaymentsService } from '../payments/payments.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { reportDefinitions, reportKeys } from './report-definition';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('reporting foundation', () => {
  const user = {
    roleId: 'role-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
  };
  const fullUser = {
    ...user,
    sub: 'user-1',
    membershipId: 'membership-1',
    branchId: 'branch-1',
    roleScope: 'BRANCH' as const,
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

    const staffService = {
      performance: jest.fn(),
    } as unknown as StaffService;
    const servicesService = {
      performance: jest.fn(),
    } as unknown as ServicesService;
    const paymentsService = {
      summary: jest.fn(),
    } as unknown as PaymentsService;
    const exportJobs = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
    } as unknown as ReportExportJobsRepository;

    return {
      prisma,
      staffService,
      servicesService,
      paymentsService,
      exportJobs,
      service: new ReportsService(
        prisma,
        staffService,
        servicesService,
        paymentsService,
        exportJobs,
      ),
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

  it('prepares an export only from server-owned exportable columns', async () => {
    const { service } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ]);

    const result = await service.prepareExport(user, {
      reportKey: reportKeys.staffPerformance,
      format: 'CSV',
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
      },
      columns: ['name', 'collected'],
      sort: { key: 'collected', direction: 'desc' },
      includeSummary: true,
      includeCharts: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        reportKey: reportKeys.staffPerformance,
        format: 'CSV',
        columns: ['name', 'collected'],
      }),
    );
  });

  it('rejects formats that are declared by the transport contract but not implemented yet', async () => {
    const { service } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ]);

    await expect(
      service.prepareExport(user, {
        reportKey: reportKeys.staffPerformance,
        format: 'XLSX',
        filters: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
        },
        includeSummary: true,
        includeCharts: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('queues a validated export with the authenticated scope snapshot', async () => {
    const { service, exportJobs } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ]);
    jest.spyOn(exportJobs, 'create').mockResolvedValue({ id: 'export-1' } as never);

    await service.createExportJob(fullUser, {
      reportKey: reportKeys.staffPerformance,
      format: 'CSV',
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
      },
      columns: ['name', 'collected'],
      includeSummary: true,
      includeCharts: false,
    });

    expect(exportJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: fullUser,
        columns: ['name', 'collected'],
      }),
    );
  });

  it('does not allow internal scope columns to be exported', async () => {
    const { service } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ]);

    await expect(
      service.prepareExport(user, {
        reportKey: reportKeys.staffPerformance,
        format: 'CSV',
        filters: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
        },
        columns: ['name', 'branchId'],
        includeSummary: true,
        includeCharts: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow export preparation to bypass domain permission', async () => {
    const { service } = createService([
      { resource: 'reports', action: 'read' },
    ]);

    await expect(
      service.prepareExport(user, {
        reportKey: reportKeys.paymentSummary,
        format: 'PDF',
        filters: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
        },
        includeSummary: true,
        includeCharts: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sorts, paginates, projects and aggregates staff preview on the server', async () => {
    const { service, staffService } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ]);

    jest.spyOn(staffService, 'performance').mockResolvedValue([
      {
        id: 'staff-1',
        name: 'Ada Yılmaz',
        status: 'ACTIVE',
        branchId: 'branch-1',
        appointmentCount: 4,
        completedAppointments: 3,
        collected: 900,
      },
      {
        id: 'staff-2',
        name: 'Bora Demir',
        status: 'ACTIVE',
        branchId: 'branch-1',
        appointmentCount: 5,
        completedAppointments: 5,
        collected: 1500,
      },
      {
        id: 'staff-3',
        name: 'Cem Kaya',
        status: 'ACTIVE',
        branchId: 'branch-1',
        appointmentCount: 2,
        completedAppointments: 1,
        collected: 300,
      },
    ]);

    const result = await service.preview(user, {
      reportKey: reportKeys.staffPerformance,
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
      },
      columns: ['name', 'collected'],
      sort: { key: 'collected', direction: 'desc' },
      page: 1,
      limit: 2,
    });

    expect(result.data).toEqual([
      { name: 'Bora Demir', collected: 1500 },
      { name: 'Ada Yılmaz', collected: 900 },
    ]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      sort: { key: 'collected', direction: 'desc' },
      summary: {
        rowCount: 3,
        appointmentCount: 11,
        completedAppointments: 9,
        completionRate: 82,
        collected: 2700,
        averageCollectedPerCompleted: 300,
      },
    });
  });

  it('returns stable empty table metadata and zero aggregates', async () => {
    const { service, staffService } = createService([
      { resource: 'reports', action: 'read' },
      { resource: 'staff', action: 'read' },
    ]);

    jest.spyOn(staffService, 'performance').mockResolvedValue([]);

    const result = await service.preview(user, {
      reportKey: reportKeys.staffPerformance,
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
      },
      page: 1,
      limit: 25,
    });

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      sort: null,
      summary: {
        rowCount: 0,
        appointmentCount: 0,
        completedAppointments: 0,
        completionRate: 0,
        collected: 0,
        averageCollectedPerCompleted: 0,
      },
    });
  });

  it('does not allow preview to bypass domain permission', async () => {
    const { service } = createService([
      { resource: 'reports', action: 'read' },
    ]);

    await expect(
      service.preview(user, {
        reportKey: reportKeys.paymentSummary,
        filters: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
        },
        page: 1,
        limit: 25,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires reports.read for reporting endpoints', () => {
    for (const handler of [
      ReportsController.prototype.getCatalog,
      ReportsController.prototype.preview,
      ReportsController.prototype.createExport,
      ReportsController.prototype.listExports,
      ReportsController.prototype.getExport,
    ]) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler),
      ).toEqual({ resource: 'reports', action: 'read' });
    }
  });
});
