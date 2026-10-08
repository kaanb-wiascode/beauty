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
const inventoryRow = {
  id: '2026-09-15|PURCHASE',
  date: '2026-09-15',
  movementType: 'PURCHASE',
  movementCount: 2,
  quantity: 5.5,
  movementValue: 1250.75,
};

describe('ReportsService inventory row identity', () => {
  const rolePermissionFindMany = jest.fn();
  const inventoryPerformance = jest.fn();
  let service: ReportsService;

  beforeEach(async () => {
    rolePermissionFindMany.mockReset().mockResolvedValue([
      { permission: { resource: 'reports', action: 'read' } },
      { permission: { resource: 'inventory', action: 'read' } },
    ]);
    inventoryPerformance.mockReset().mockResolvedValue([inventoryRow]);

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
        { provide: FinanceReportingService, useValue: {} },
        {
          provide: InventoryReportingService,
          useValue: { performance: inventoryPerformance },
        },
        { provide: ProcurementReportingService, useValue: {} },
        { provide: CrmReportingService, useValue: {} },
        { provide: HrReportingService, useValue: {} },
        { provide: ReportExportJobsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  it('adds server-owned composite _rowId to inventory previews', async () => {
    const result = await service.preview(user, {
      reportKey: 'inventory.performance',
      filters,
      columns: ['date', 'movementType', 'movementValue'],
      sort: { key: 'date', direction: 'desc' },
      page: 1,
      limit: 25,
    });

    expect(result.report.drilldowns).toEqual(['stock-movements']);
    expect(result.data).toEqual([
      {
        date: '2026-09-15',
        movementType: 'PURCHASE',
        movementValue: 1250.75,
        _rowId: '2026-09-15|PURCHASE',
      },
    ]);
  });

  it('never exports the internal inventory bucket identity', async () => {
    const result = await service.materializeExport(user, {
      reportKey: 'inventory.performance',
      format: 'CSV',
      filters,
      columns: ['date', 'movementType', 'movementValue'],
      columnMode: 'VISIBLE',
      sort: { key: 'date', direction: 'desc' },
      includeSummary: true,
      includeCharts: false,
    });

    expect(result.rows).toEqual([
      {
        date: '2026-09-15',
        movementType: 'PURCHASE',
        movementValue: 1250.75,
      },
    ]);
    expect(result.rows[0]).not.toHaveProperty('id');
    expect(result.rows[0]).not.toHaveProperty('_rowId');
  });
});
