import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';

import { AppointmentReportingService } from '../appointments/appointment-reporting.service';
import { CrmReportingService } from '../crm/crm-reporting.service';
import { CustomerReportingService } from '../customers/customer-reporting.service';
import { FinanceReportingService } from '../finance/finance-reporting.service';
import { HrReportingService } from '../hr/hr-reporting.service';
import { InventoryReportingService } from '../inventory/inventory-reporting.service';
import { PaymentsService } from '../payments/payments.service';
import { ProcurementReportingService } from '../procurement/procurement-reporting.service';
import { SalesReportingService } from '../sales/sales-reporting.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { ReportsService } from './reports.service';

const branchId = '11111111-1111-4111-8111-111111111111';
const filters = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.999Z'),
};
const user = {
  roleId: 'role-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
};
const branchRow = {
  id: branchId,
  branchName: 'Kadıköy',
  appointmentCount: 4,
  completedCount: 3,
  cancelledCount: 0,
  noShowCount: 1,
  completionRate: 75,
  uniqueCustomerCount: 4,
  collected: 2400,
  averageCollectedPerCompleted: 800,
};

describe('ReportsService branch row identity', () => {
  const rolePermissionFindMany = jest.fn();
  const branchPerformance = jest.fn();
  let service: ReportsService;

  beforeEach(async () => {
    rolePermissionFindMany.mockReset().mockResolvedValue([
      { permission: { resource: 'reports', action: 'read' } },
      { permission: { resource: 'appointments', action: 'read' } },
    ]);
    branchPerformance.mockReset().mockResolvedValue([branchRow]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: { rolePermission: { findMany: rolePermissionFindMany } },
        },
        { provide: StaffService, useValue: {} },
        { provide: ServicesService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: CustomerReportingService, useValue: {} },
        { provide: SalesReportingService, useValue: {} },
        {
          provide: AppointmentReportingService,
          useValue: { branchPerformance },
        },
        { provide: FinanceReportingService, useValue: {} },
        { provide: InventoryReportingService, useValue: {} },
        { provide: ProcurementReportingService, useValue: {} },
        { provide: CrmReportingService, useValue: {} },
        { provide: HrReportingService, useValue: {} },
        { provide: ReportExportJobsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  it('adds server-owned _rowId to branch previews without exposing id as a column', async () => {
    const result = await service.preview(user, {
      reportKey: 'branches.performance',
      filters,
      columns: ['branchName', 'collected'],
      sort: { key: 'collected', direction: 'desc' },
      page: 1,
      limit: 25,
    });

    expect(result.report.drilldowns).toEqual(['appointments']);
    expect(result.columns).toEqual(['branchName', 'collected']);
    expect(result.data).toEqual([
      { branchName: 'Kadıköy', collected: 2400, _rowId: branchId },
    ]);
  });

  it('never exports the internal branch row identity', async () => {
    const result = await service.materializeExport(user, {
      reportKey: 'branches.performance',
      format: 'CSV',
      filters,
      columns: ['branchName', 'collected'],
      columnMode: 'VISIBLE',
      sort: { key: 'collected', direction: 'desc' },
      includeSummary: true,
      includeCharts: false,
    });

    expect(result.rows).toEqual([{ branchName: 'Kadıköy', collected: 2400 }]);
    expect(result.rows[0]).not.toHaveProperty('id');
    expect(result.rows[0]).not.toHaveProperty('_rowId');
  });
});
