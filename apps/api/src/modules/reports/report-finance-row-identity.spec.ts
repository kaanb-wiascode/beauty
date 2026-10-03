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

const filters = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.999Z'),
};
const user = {
  roleId: 'role-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
};
const financeRow = {
  id: '2026-09-10',
  date: '2026-09-10',
  incomeRecognized: 2000,
  expenseRecognized: 1000,
  payableAmount: 900,
  operatingMargin: 1000,
  collected: 1200,
  paid: 600,
  netCashMovement: 600,
  receivableOutstanding: 800,
  payableOutstanding: 300,
  collectionRate: 60,
  paymentRate: 67,
  incomeRecordCount: 1,
  expenseRecordCount: 1,
};

describe('ReportsService finance row identity', () => {
  const rolePermissionFindMany = jest.fn();
  const financePerformance = jest.fn();
  let service: ReportsService;

  beforeEach(async () => {
    rolePermissionFindMany.mockReset().mockResolvedValue([
      { permission: { resource: 'reports', action: 'read' } },
      { permission: { resource: 'finance', action: 'read' } },
    ]);
    financePerformance.mockReset().mockResolvedValue([financeRow]);

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
        { provide: AppointmentReportingService, useValue: {} },
        {
          provide: FinanceReportingService,
          useValue: { performance: financePerformance },
        },
        { provide: InventoryReportingService, useValue: {} },
        { provide: ProcurementReportingService, useValue: {} },
        { provide: CrmReportingService, useValue: {} },
        { provide: HrReportingService, useValue: {} },
        { provide: ReportExportJobsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  it('adds server-owned _rowId to finance previews without exposing id as a column', async () => {
    const result = await service.preview(user, {
      reportKey: 'finance.performance',
      filters,
      columns: ['date', 'incomeRecognized', 'collected'],
      sort: { key: 'date', direction: 'desc' },
      page: 1,
      limit: 25,
    });

    expect(result.report.drilldowns).toEqual(['finance-records']);
    expect(result.columns).toEqual(['date', 'incomeRecognized', 'collected']);
    expect(result.data).toEqual([
      {
        date: '2026-09-10',
        incomeRecognized: 2000,
        collected: 1200,
        _rowId: '2026-09-10',
      },
    ]);
  });

  it('never exports the internal finance day identity', async () => {
    const result = await service.materializeExport(user, {
      reportKey: 'finance.performance',
      format: 'CSV',
      filters,
      columns: ['date', 'incomeRecognized', 'collected'],
      columnMode: 'VISIBLE',
      sort: { key: 'date', direction: 'desc' },
      includeSummary: true,
      includeCharts: false,
    });

    expect(result.rows).toEqual([
      {
        date: '2026-09-10',
        incomeRecognized: 2000,
        collected: 1200,
      },
    ]);
    expect(result.rows[0]).not.toHaveProperty('id');
    expect(result.rows[0]).not.toHaveProperty('_rowId');
  });
});
