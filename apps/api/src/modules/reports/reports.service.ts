import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PaymentsService } from '../payments/payments.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import type { ReportExportInput } from './dto/report-export.dto';
import type { ReportPreviewInput } from './dto/report-preview.dto';
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
        permission: {
          select: {
            resource: true,
            action: true,
          },
        },
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

    const columns = this.resolveExportColumns(definition, input.columns);
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
            ? Math.round(
                (row.completedAppointments / row.appointmentCount) * 100,
              )
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
          name: row.service.name,
          price: Number(row.service.price),
          status: row.service.status,
          branchId: row.service.branchId,
          appointmentCount: row.appointmentCount,
          completedAppointments: row.completedAppointments,
          completionRate: row.appointmentCount
            ? Math.round(
                (row.completedAppointments / row.appointmentCount) * 100,
              )
            : 0,
          collected: row.collected,
        })),
        input,
      );
    }

    const summary = await this.paymentsService.summary(input.filters);
    return {
      report: {
        key: definition.key,
        resultKind: definition.resultKind,
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
    if (!definition) {
      throw new BadRequestException('Unsupported report');
    }

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
  ) {
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
      throw new BadRequestException(
        `Unsupported report sort: ${sortKey}`,
      );
    }
  }

  private buildTablePreview(
    definition: ReportDefinition,
    columns: readonly string[],
    rows: readonly Record<string, unknown>[],
    input: ReportPreviewInput,
  ) {
    const sorted = [...rows];
    if (input.sort) {
      sorted.sort((a, b) => {
        const result = this.compareValues(
          a[input.sort!.key],
          b[input.sort!.key],
        );
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
      },
      columns,
      data: pageRows.map((row) => this.selectColumns(row, columns)),
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
        sort: input.sort ?? null,
        summary: this.buildAggregateSummary(rows),
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

  private numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private selectColumns(
    value: Record<string, unknown>,
    columns: readonly string[],
  ) {
    return Object.fromEntries(
      columns.map((column) => [column, value[column]]),
    );
  }

  private compareValues(a: unknown, b: unknown) {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    return String(a ?? '').localeCompare(String(b ?? ''), 'tr-TR');
  }
}
