import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { PaymentsService } from '../payments/payments.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { reportKeys } from './report-definition';
import { ReportsService } from './reports.service';

describe('report export column modes', () => {
  const user = {
    roleId: 'role-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
  };

  function createService() {
    const prisma = {
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([
          { permission: { resource: 'reports', action: 'read' } },
          { permission: { resource: 'staff', action: 'read' } },
        ]),
      },
    } as unknown as PrismaService;

    return new ReportsService(
      prisma,
      { performance: jest.fn() } as unknown as StaffService,
      { performance: jest.fn() } as unknown as ServicesService,
      { summary: jest.fn() } as unknown as PaymentsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        create: jest.fn(),
        list: jest.fn(),
        findById: jest.fn(),
      } as unknown as ReportExportJobsRepository,
    );
  }

  it('resolves ALL_PERMITTED from the server-owned exportable column policy', async () => {
    const service = createService();

    const prepared = await service.prepareExport(user, {
      reportKey: reportKeys.staffPerformance,
      format: 'XLSX',
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-30T23:59:59.999Z'),
      },
      columnMode: 'ALL_PERMITTED',
      columns: ['branchId'],
      includeSummary: true,
      includeCharts: false,
    });

    expect(prepared.columns).toEqual([
      'name',
      'status',
      'appointmentCount',
      'completedAppointments',
      'completionRate',
      'collected',
    ]);
    expect(prepared.columns).not.toContain('branchId');
  });

  it('still rejects non-exportable columns in VISIBLE mode', async () => {
    const service = createService();

    await expect(
      service.prepareExport(user, {
        reportKey: reportKeys.staffPerformance,
        format: 'PDF',
        filters: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
        },
        columnMode: 'VISIBLE',
        columns: ['name', 'branchId'],
        includeSummary: true,
        includeCharts: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
