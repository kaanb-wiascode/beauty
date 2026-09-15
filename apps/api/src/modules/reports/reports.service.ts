import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { AppointmentReportingService } from '../appointments/appointment-reporting.service';
import { CustomerReportingService } from '../customers/customer-reporting.service';
import { FinanceReportingService } from '../finance/finance-reporting.service';
import { PaymentsService } from '../payments/payments.service';
import { SalesReportingService } from '../sales/sales-reporting.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import type { ReportExportInput } from './dto/report-export.dto';
import type { ReportExportListInput } from './dto/report-export-list.dto';
import type { ReportPreviewInput } from './dto/report-preview.dto';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import {
  getReportDefinition,
  reportDefinitions,
  reportKeys,
  type ReportDefinition,
} from './report-definition';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffService: StaffService,
    private readonly servicesService: ServicesService,
    private readonly paymentsService: PaymentsService,
    private readonly customerReporting: CustomerReportingService,
    private readonly salesReporting: SalesReportingService,
    private readonly appointmentReporting: AppointmentReportingService,
    private readonly financeReporting: FinanceReportingService,
    private readonly exportJobs: ReportExportJobsRepository,
  ) {}

  async getCatalog(
    user: Pick<JwtPayload, 'roleId' | 'tenantId' | 'companyId'>,
  ) {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: user.roleId,
        role: {
          tenantId: user.tenantId,
          OR: [{ companyId: null }, { companyId: user.companyId }],
        },
      },
      select: {
        permission: { select: { resource: true, action: true } },
      },
    });

    const granted = new Set(
      rolePermissions.map(
        ({ permission }) => `${permission.resource}:${permission.action}`,
      ),
    );

    return reportDefinitions.filter((report) =>
      report.requiredPermissions.every((permission) =>
        granted.has(`${permission.resource}:${permission.action}`),
      ),
    );
  }

  async prepareExport(
    user: Pick<JwtPayload, 'roleId' | 'tenantId' | 'companyId'>,
    input: ReportExportInput,
  ) {
    const definition = await this.authorizeDefinition(user, input.reportKey);
    if (!definition.exportFormats.includes(input.format)) {
      throw new BadRequestException(
        `Unsupported report export format: ${input.format}`,
      );
    }
    const columns = this.resolveExportColumns(
      definition,
      input.columns,
      input.columnMode,
    );
    this.validateSort(definition, input.sort?.key);
    return {
      reportKey: definition.key,
      format: input.format,
      filters: input.filters,
      columns,
      sort: input.sort ?? null,
      includeSummary: input.includeSummary,
      includeCharts: input.includeCharts,
    };
  }

  async materializeExport(
    user: Pick<JwtPayload, 'roleId' | 'tenantId' | 'companyId'>,
    input: ReportExportInput,
  ) {
    const prepared = await this.prepareExport(user, input);
    const definition = getReportDefinition(prepared.reportKey)!;

    if (definition.key === reportKeys.staffPerformance) {
      const sourceRows = await this.staffService.performance(input.filters);
      const rows = sourceRows.map((row) => ({
        ...row,
        completionRate: row.appointmentCount
          ? Math.round((row.completedAppointments / row.appointmentCount) * 100)
          : 0,
      }));
      const sorted = this.sortRows(rows, prepared.sort);
      return {
        reportKey: prepared.reportKey,
        resultKind: definition.resultKind,
        columns: prepared.columns,
        rows: sorted.map((row) => this.selectColumns(row, prepared.columns)),
        summary: prepared.includeSummary ? this.buildAggregateSummary(rows) : null,
      };
    }

    if (definition.key === reportKeys.servicePerformance) {
      const sourceRows = await this.servicesService.performance(input.filters);
      const rows = sourceRows.map((row) => ({
        id: row.service.id,
        name: row.service.name,
        price: Number(row.service.price),
        status: row.service.status,
        branchId: row.service.branchId,
        appointmentCount: row.appointmentCount,
        completedAppointments: row.completedAppointments,
        completionRate: row.appointmentCount
          ? Math.round((row.completedAppointments / row.appointmentCount) * 100)
          : 0,
        collected: row.collected,
      }));
      const sorted = this.sortRows(rows, prepared.sort);
      return {
        reportKey: prepared.reportKey,
        resultKind: definition.resultKind,
        columns: prepared.columns,
        rows: sorted.map((row) => this.selectColumns(row, prepared.columns)),
        summary: prepared.includeSummary ? this.buildAggregateSummary(rows) : null,
      };
    }

    if (definition.key === reportKeys.customerPerformance) {
      const rows = await this.customerReporting.performance(input.filters);
      const sorted = this.sortRows(rows, prepared.sort);
      return {
        reportKey: prepared.reportKey,
        resultKind: definition.resultKind,
        columns: prepared.columns,
        rows: sorted.map((row) => this.selectColumns(row, prepared.columns)),
        summary: prepared.includeSummary ? this.buildCustomerSummary(rows) : null,
      };
    }

    if (definition.key === reportKeys.salesPerformance) {
      const rows = await this.salesReporting.performance(input.filters);
      const sorted = this.sortRows(rows, prepared.sort);
      return {
        reportKey: prepared.reportKey,
        resultKind: definition.resultKind,
        columns: prepared.columns,
        rows: sorted.map((row) => this.selectColumns(row, prepared.columns)),
        summary: prepared.includeSummary ? this.buildSalesSummary(rows) : null,
      };
    }

    if (definition.key === reportKeys.appointmentPerformance) {
      const rows = await this.appointmentReporting.performance(input.filters);
      const sorted = this.sortRows(rows, prepared.sort);
      return {
        reportKey: prepared.reportKey,
        resultKind: definition.resultKind,
        columns: prepared.columns,
        rows: sorted.map((row) => this.selectColumns(row, prepared.columns)),
        summary: prepared.includeSummary
          ? this.buildAppointmentSummary(rows)
          : null,
      };
    }

    if (definition.key === reportKeys.financePerformance) {
      const rows = await this.financeReporting.performance(input.filters);
      const sorted = this.sortRows(rows, prepared.sort);
      return {
        reportKey: prepared.reportKey,
        resultKind: definition.resultKind,
        columns: prepared.columns,
        rows: sorted.map((row) => this.selectColumns(row, prepared.columns)),
        summary: prepared.includeSummary ? this.buildFinanceSummary(rows) : null,
      };
    }

    const summary = await this.paymentsService.summary(input.filters);
    return {
      reportKey: prepared.reportKey,
      resultKind: definition.resultKind,
      columns: prepared.columns,
      rows: [this.selectColumns(summary, prepared.columns)],
      summary: prepared.includeSummary ? summary : null,
    };
  }

  async createExportJob(user: JwtPayload, input: ReportExportInput) {
    const prepared = await this.prepareExport(user, input);
    return this.exportJobs.create({ user, input, columns: prepared.columns });
  }

  listExportJobs(user: JwtPayload, input: ReportExportListInput) {
    return this.exportJobs.list(user, input);
  }

  async getExportJob(user: JwtPayload, id: string) {
    const job = await this.exportJobs.findById(user, id);
    if (!job) throw new NotFoundException('Report export job not found');
    return job;
  }

  async preview(
    user: Pick<JwtPayload, 'roleId' | 'tenantId' | 'companyId'>,
    input: ReportPreviewInput,
  ) {
    const definition = await this.authorizeDefinition(user, input.reportKey);
    const columns = this.resolveColumns(definition, input.columns);
    this.validateSort(definition, input.sort?.key);

    if (definition.key === reportKeys.staffPerformance) {
      const rows = await this.staffService.performance(input.filters);
      return this.buildTablePreview(
        definition,
        columns,
        rows.map((row) => ({
          ...row,
          completionRate: row.appointmentCount
            ? Math.round((row.completedAppointments / row.appointmentCount) * 100)
            : 0,
        })),
        input,
      );
    }

    if (definition.key === reportKeys.servicePerformance) {
      const rows = await this.servicesService.performance(input.filters);
      return this.buildTablePreview(
        definition,
        columns,
        rows.map((row) => ({
          id: row.service.id,
          name: row.service.name,
          price: Number(row.service.price),
          status: row.service.status,
          branchId: row.service.branchId,
          appointmentCount: row.appointmentCount,
          completedAppointments: row.completedAppointments,
          completionRate: row.appointmentCount
            ? Math.round((row.completedAppointments / row.appointmentCount) * 100)
            : 0,
          collected: row.collected,
        })),
        input,
      );
    }

    if (definition.key === reportKeys.customerPerformance) {
      const rows = await this.customerReporting.performance(input.filters);
      return this.buildTablePreview(
        definition,
        columns,
        rows,
        input,
        this.buildCustomerSummary(rows),
      );
    }

    if (definition.key === reportKeys.salesPerformance) {
      const rows = await this.salesReporting.performance(input.filters);
      return this.buildTablePreview(
        definition,
        columns,
        rows,
        input,
        this.buildSalesSummary(rows),
      );
    }

    if (definition.key === reportKeys.appointmentPerformance) {
      const rows = await this.appointmentReporting.performance(input.filters);
      return this.buildTablePreview(
        definition,
        columns,
        rows,
        input,
        this.buildAppointmentSummary(rows),
      );
    }

    if (definition.key === reportKeys.financePerformance) {
      const rows = await this.financeReporting.performance(input.filters);
      return this.buildTablePreview(
        definition,
        columns,
        rows,
        input,
        this.buildFinanceSummary(rows),
      );
    }

    const summary = await this.paymentsService.summary(input.filters);
    return {
      report: {
        key: definition.key,
        resultKind: definition.resultKind,
        drilldowns: definition.drilldowns,
      },
      columns,
      data: this.selectColumns(summary, columns),
      meta: null,
    };
  }

  private async authorizeDefinition(
    user: Pick<JwtPayload, 'roleId' | 'tenantId' | 'companyId'>,
    reportKey: ReportPreviewInput['reportKey'],
  ) {
    const definition = getReportDefinition(reportKey);
    if (!definition) throw new BadRequestException('Unsupported report');
    const catalog = await this.getCatalog(user);
    if (!catalog.some((report) => report.key === definition.key)) {
      throw new ForbiddenException(
        'You do not have permission to view this report',
      );
    }
    return definition;
  }

  private resolveColumns(
    definition: ReportDefinition,
    requested?: readonly string[],
  ) {
    const columns = requested?.length
      ? [...new Set(requested)]
      : [...definition.defaultColumns];
    const invalid = columns.filter(
      (column) => !definition.availableColumns.includes(column),
    );
    if (invalid.length) {
      throw new BadRequestException(
        `Unsupported report columns: ${invalid.join(', ')}`,
      );
    }
    return columns;
  }

  private resolveExportColumns(
    definition: ReportDefinition,
    requested?: readonly string[],
    mode: ReportExportInput['columnMode'] = 'VISIBLE',
  ) {
    if (mode === 'ALL_PERMITTED') return [...definition.exportableColumns];
    const defaults = definition.defaultColumns.filter((column) =>
      definition.exportableColumns.includes(column),
    );
    const columns = requested?.length ? [...new Set(requested)] : defaults;
    const invalid = columns.filter(
      (column) => !definition.exportableColumns.includes(column),
    );
    if (invalid.length) {
      throw new BadRequestException(
        `Unsupported report export columns: ${invalid.join(', ')}`,
      );
    }
    return columns;
  }

  private validateSort(definition: ReportDefinition, sortKey?: string) {
    if (sortKey && !definition.sortableColumns.includes(sortKey)) {
      throw new BadRequestException(`Unsupported report sort: ${sortKey}`);
    }
  }

  private sortRows(
    rows: readonly Record<string, unknown>[],
    sort: ReportExportInput['sort'] | null,
  ) {
    const sorted = [...rows];
    if (!sort) return sorted;
    sorted.sort((a, b) => {
      const result = this.compareValues(a[sort.key], b[sort.key]);
      return sort.direction === 'asc' ? result : -result;
    });
    return sorted;
  }

  private buildTablePreview(
    definition: ReportDefinition,
    columns: readonly string[],
    rows: readonly Record<string, unknown>[],
    input: ReportPreviewInput,
    summary: Record<string, unknown> = this.buildAggregateSummary(rows),
  ) {
    const sorted = [...rows];
    if (input.sort) {
      sorted.sort((a, b) => {
        const result = this.compareValues(a[input.sort!.key], b[input.sort!.key]);
        return input.sort!.direction === 'asc' ? result : -result;
      });
    }
    const total = sorted.length;
    const start = (input.page - 1) * input.limit;
    const pageRows = sorted.slice(start, start + input.limit);
    return {
      report: {
        key: definition.key,
        resultKind: definition.resultKind,
        drilldowns: definition.drilldowns,
      },
      columns,
      data: pageRows.map((row) => {
        const selected = this.selectColumns(row, columns);
        return definition.drilldowns.length > 0 && typeof row.id === 'string'
          ? { ...selected, _rowId: row.id }
          : selected;
      }),
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
        sort: input.sort ?? null,
        summary,
      },
    };
  }

  private buildAggregateSummary(rows: readonly Record<string, unknown>[]) {
    const appointmentCount = rows.reduce(
      (total, row) => total + this.numberValue(row.appointmentCount),
      0,
    );
    const completedAppointments = rows.reduce(
      (total, row) => total + this.numberValue(row.completedAppointments),
      0,
    );
    const collected = rows.reduce(
      (total, row) => total + this.numberValue(row.collected),
      0,
    );
    return {
      rowCount: rows.length,
      appointmentCount,
      completedAppointments,
      completionRate: appointmentCount
        ? Math.round((completedAppointments / appointmentCount) * 100)
        : 0,
      collected,
      averageCollectedPerCompleted: completedAppointments
        ? collected / completedAppointments
        : 0,
    };
  }

  private buildCustomerSummary(rows: readonly Record<string, unknown>[]) {
    const visitCount = rows.reduce(
      (total, row) => total + this.numberValue(row.visitCount),
      0,
    );
    const completedVisits = rows.reduce(
      (total, row) => total + this.numberValue(row.completedVisits),
      0,
    );
    const collected = rows.reduce(
      (total, row) => total + this.numberValue(row.collected),
      0,
    );
    const customersWithVisits = rows.filter(
      (row) => this.numberValue(row.visitCount) > 0,
    ).length;
    return {
      rowCount: rows.length,
      customersWithVisits,
      visitCount,
      completedVisits,
      collected,
      averageCollectedPerCustomer: customersWithVisits
        ? collected / customersWithVisits
        : 0,
      averageCollectedPerCompletedVisit: completedVisits
        ? collected / completedVisits
        : 0,
    };
  }

  private buildSalesSummary(rows: readonly Record<string, unknown>[]) {
    const revenue = rows.reduce((t, r) => t + this.numberValue(r.revenue), 0);
    const collected = rows.reduce((t, r) => t + this.numberValue(r.collected), 0);
    const refunded = rows.reduce((t, r) => t + this.numberValue(r.refunded), 0);
    const outstanding = rows.reduce((t, r) => t + this.numberValue(r.outstanding), 0);
    const discountTotal = rows.reduce((t, r) => t + this.numberValue(r.discountTotal), 0);
    return {
      rowCount: rows.length,
      saleCount: rows.length,
      revenue,
      collected,
      refunded,
      netCollected: collected,
      outstanding,
      discountTotal,
      averageBasket: rows.length ? revenue / rows.length : 0,
      collectionRate: revenue ? Math.round((collected / revenue) * 100) : 0,
    };
  }

  private buildAppointmentSummary(rows: readonly Record<string, unknown>[]) {
    const appointmentCount = rows.reduce((t, r) => t + this.numberValue(r.appointmentCount), 0);
    const completedCount = rows.reduce((t, r) => t + this.numberValue(r.completedCount), 0);
    const completedCustomerCount = rows.reduce((t, r) => t + this.numberValue(r.completedCustomerCount), 0);
    const cancelledCount = rows.reduce((t, r) => t + this.numberValue(r.cancelledCount), 0);
    const noShowCount = rows.reduce((t, r) => t + this.numberValue(r.noShowCount), 0);
    const newCustomerCount = rows.reduce((t, r) => t + this.numberValue(r.newCustomerCount), 0);
    const repeatCustomerCount = rows.reduce((t, r) => t + this.numberValue(r.repeatCustomerCount), 0);
    const rebookedCustomerCount = rows.reduce((t, r) => t + this.numberValue(r.rebookedCustomerCount), 0);
    const collected = rows.reduce((t, r) => t + this.numberValue(r.collected), 0);
    const resolved = completedCount + cancelledCount + noShowCount;
    return {
      rowCount: rows.length,
      appointmentCount,
      completedCount,
      completedCustomerCount,
      cancelledCount,
      noShowCount,
      completionRate: resolved ? Math.round((completedCount / resolved) * 100) : 0,
      cancellationRate: resolved ? Math.round((cancelledCount / resolved) * 100) : 0,
      noShowRate: resolved ? Math.round((noShowCount / resolved) * 100) : 0,
      newCustomerCount,
      repeatCustomerCount,
      rebookedCustomerCount,
      rebookingRate: completedCustomerCount
        ? Math.round((rebookedCustomerCount / completedCustomerCount) * 100)
        : 0,
      collected,
    };
  }

  private buildFinanceSummary(rows: readonly Record<string, unknown>[]) {
    const incomeRecognized = rows.reduce((t, r) => t + this.numberValue(r.incomeRecognized), 0);
    const expenseRecognized = rows.reduce((t, r) => t + this.numberValue(r.expenseRecognized), 0);
    const collected = rows.reduce((t, r) => t + this.numberValue(r.collected), 0);
    const paid = rows.reduce((t, r) => t + this.numberValue(r.paid), 0);
    const receivableOutstanding = rows.reduce((t, r) => t + this.numberValue(r.receivableOutstanding), 0);
    const payableOutstanding = rows.reduce((t, r) => t + this.numberValue(r.payableOutstanding), 0);
    const incomeRecordCount = rows.reduce((t, r) => t + this.numberValue(r.incomeRecordCount), 0);
    const expenseRecordCount = rows.reduce((t, r) => t + this.numberValue(r.expenseRecordCount), 0);
    return {
      rowCount: rows.length,
      incomeRecognized,
      expenseRecognized,
      operatingMargin: incomeRecognized - expenseRecognized,
      collected,
      paid,
      netCashMovement: collected - paid,
      receivableOutstanding,
      payableOutstanding,
      incomeRecordCount,
      expenseRecordCount,
      collectionRate: incomeRecognized
        ? Math.round((collected / incomeRecognized) * 100)
        : 0,
      paymentRate: expenseRecognized
        ? Math.round((paid / expenseRecognized) * 100)
        : 0,
    };
  }

  private numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private selectColumns(
    value: Record<string, unknown>,
    columns: readonly string[],
  ) {
    return Object.fromEntries(columns.map((column) => [column, value[column]]));
  }

  private compareValues(a: unknown, b: unknown) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (a instanceof Date) return 1;
    if (b instanceof Date) return -1;
    return String(a ?? '').localeCompare(String(b ?? ''), 'tr-TR');
  }
}
