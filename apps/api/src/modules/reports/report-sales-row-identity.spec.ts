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

const saleId = '11111111-1111-4111-8111-111111111111';
const filters = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.999Z'),
};
const user = {
  roleId: 'role-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
};
const saleRow = {
  id: saleId,
  branchId: 'branch-1',
  confirmedAt: new Date('2026-09-15T12:00:00.000Z'),
  customerName: 'Ada Yılmaz',
  subtotal: 1600,
  discountTotal: 100,
  revenue: 1500,
  grossCollected: 1500,
  collected: 1500,
  refunded: 0,
  netCollected: 1500,
  outstanding: 0,
  itemCount: 1,
  serviceQuantity: 1,
  packageQuantity: 0,
};

describe('ReportsService sales row identity', () => {
  const rolePermissionFindMany = jest.fn();
  const salesPerformance = jest.fn();
  let service: ReportsService;

  beforeEach(async () => {
    rolePermissionFindMany.mockReset().mockResolvedValue([
      { permission: { resource: 'reports', action: 'read' } },
      { permission: { resource: 'payments', action: 'read' } },
    ]);
    salesPerformance.mockReset().mockResolvedValue([saleRow]);

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
        {
          provide: SalesReportingService,
          useValue: { performance: salesPerformance },
        },
        { provide: AppointmentReportingService, useValue: {} },
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

  it('adds server-owned _rowId to sales previews without exposing id as a column', async () => {
    const result = await service.preview(user, {
      reportKey: 'sales.performance',
      filters,
      columns: ['confirmedAt', 'customerName', 'revenue'],
      sort: { key: 'confirmedAt', direction: 'desc' },
      page: 1,
      limit: 25,
    });

    expect(result.report.drilldowns).toEqual(['sale']);
    expect(result.columns).toEqual(['confirmedAt', 'customerName', 'revenue']);
    expect(result.data).toEqual([
      {
        confirmedAt: saleRow.confirmedAt,
        customerName: 'Ada Yılmaz',
        revenue: 1500,
        _rowId: saleId,
      },
    ]);
  });

  it('never exports the internal sale row identity', async () => {
    const result = await service.materializeExport(user, {
      reportKey: 'sales.performance',
      format: 'CSV',
      filters,
      columns: ['confirmedAt', 'customerName', 'revenue'],
      columnMode: 'VISIBLE',
      sort: { key: 'confirmedAt', direction: 'desc' },
      includeSummary: true,
      includeCharts: false,
    });

    expect(result.rows).toEqual([
      {
        confirmedAt: saleRow.confirmedAt,
        customerName: 'Ada Yılmaz',
        revenue: 1500,
      },
    ]);
    expect(result.rows[0]).not.toHaveProperty('id');
    expect(result.rows[0]).not.toHaveProperty('_rowId');
  });
});
