import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { FinanceReportingService } from '../finance/finance-reporting.service';
import { InventoryReportingService } from '../inventory/inventory-reporting.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import {
  parseInventoryMovementRowId,
  type ReportDrilldownInput,
} from './dto/report-drilldown.dto';
import { reportKeys } from './report-definition';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportDrilldownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationScope: OrganizationScopeService,
    private readonly financeReporting: FinanceReportingService,
    private readonly inventoryReporting: InventoryReportingService,
    private readonly staffService: StaffService,
    private readonly servicesService: ServicesService,
    private readonly reports: ReportsService,
  ) {}

  async drilldown(user: JwtPayload, input: ReportDrilldownInput) {
    const catalog = await this.reports.getCatalog(user);
    if (!catalog.some((report) => report.key === input.reportKey)) {
      throw new ForbiddenException(
        'You do not have permission to drill into this report',
      );
    }

    if (input.reportKey === reportKeys.staffPerformance) {
      await this.staffService.findOne(input.rowId);
      return this.appointments(input, { staffId: input.rowId });
    }

    if (input.reportKey === reportKeys.servicePerformance) {
      await this.servicesService.findOne(input.rowId);
      return this.appointments(input, { serviceId: input.rowId });
    }

    if (input.reportKey === reportKeys.customerPerformance) {
      await this.assertCustomerInScope(input.rowId);
      return this.appointments(input, { customerId: input.rowId });
    }

    if (input.reportKey === reportKeys.salesPerformance) {
      return this.sale(input);
    }

    if (input.reportKey === reportKeys.inventoryPerformance) {
      const row = parseInventoryMovementRowId(input.rowId);
      if (!row) {
        throw new NotFoundException('Report drilldown row not found');
      }
      const range = this.resolveUtcDayRange(input, row.date);
      return {
        report: {
          key: input.reportKey,
          dimension: input.dimension,
          rowId: input.rowId,
        },
        data: await this.inventoryReporting.movementDetails({
          ...range,
          movementType: row.movementType,
        }),
      };
    }

    if (input.reportKey === reportKeys.financePerformance) {
      return {
        report: {
          key: input.reportKey,
          dimension: input.dimension,
          rowId: input.rowId,
        },
        data: await this.financeReporting.dayDetails(
          this.resolveUtcDayRange(input),
        ),
      };
    }

    if (input.reportKey === reportKeys.appointmentPerformance) {
      return this.appointments(
        input,
        null,
        this.resolveUtcDayRange(input),
      );
    }

    await this.assertBranchInScope(user, input.rowId);
    return this.appointments(input, { branchId: input.rowId });
  }

  private async sale(input: ReportDrilldownInput) {
    const scope = await this.organizationScope.getBranchScopedWhere();
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: input.rowId,
        ...scope,
        status: 'CONFIRMED',
        confirmedAt: {
          gte: input.filters.from,
          lte: input.filters.to,
        },
      },
      select: {
        id: true,
        confirmedAt: true,
        status: true,
        subtotal: true,
        discountTotal: true,
        total: true,
        items: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            type: true,
            description: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            paidAt: true,
            refundedAt: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Report drilldown row not found');
    }

    return {
      report: {
        key: input.reportKey,
        dimension: input.dimension,
        rowId: input.rowId,
      },
      data: {
        id: sale.id,
        confirmedAt: sale.confirmedAt,
        status: sale.status,
        subtotal: Number(sale.subtotal),
        discountTotal: Number(sale.discountTotal),
        total: Number(sale.total),
        items: sale.items.map((item) => ({
          id: item.id,
          type: item.type,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          lineTotal: Number(item.lineTotal),
        })),
        payments: sale.payments.map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount),
          method: payment.method,
          status: payment.status,
          paidAt: payment.paidAt,
          refundedAt: payment.refundedAt,
        })),
      },
    };
  }

  private resolveUtcDayRange(
    input: ReportDrilldownInput,
    rowDate = input.rowId,
  ) {
    const dayStart = new Date(`${rowDate}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    const from = new Date(
      Math.max(dayStart.getTime(), input.filters.from.getTime()),
    );
    const to = new Date(
      Math.min(dayEnd.getTime(), input.filters.to.getTime()),
    );

    if (from.getTime() > to.getTime()) {
      throw new NotFoundException('Report drilldown row not found');
    }

    return { from, to };
  }

  private async assertCustomerInScope(customerId: string) {
    const scope = await this.organizationScope.getBranchScopedWhere();
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        ...scope,
      },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Report drilldown row not found');
    }
  }

  private async assertBranchInScope(user: JwtPayload, branchId: string) {
    const scope = await this.organizationScope.getBranchScopedWhere();

    if ('branchId' in scope) {
      const allowed =
        typeof scope.branchId === 'string'
          ? scope.branchId === branchId
          : scope.branchId.in.includes(branchId);

      if (!allowed) {
        throw new NotFoundException('Report drilldown row not found');
      }
    }

    const companyId = 'branch' in scope ? scope.branch.companyId : user.companyId;
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('Report drilldown row not found');
    }
  }

  private async appointments(
    input: ReportDrilldownInput,
    entity:
      | { staffId: string }
      | { serviceId: string }
      | { customerId: string }
      | { branchId: string }
      | null,
    range = input.filters,
  ) {
    const skip = (input.page - 1) * input.limit;
    const scope = await this.organizationScope.getBranchScopedWhere();
    const where = {
      ...scope,
      ...(entity ?? {}),
      startAt: {
        gte: range.from,
        lte: range.to,
      },
    };

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: input.limit,
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          payment: {
            select: {
              amount: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      report: {
        key: input.reportKey,
        dimension: input.dimension,
        rowId: input.rowId,
      },
      columns: [
        'startAt',
        'endAt',
        'status',
        'paymentAmount',
        'paymentStatus',
      ],
      data: appointments.map((appointment) => ({
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        paymentAmount: appointment.payment
          ? Number(appointment.payment.amount)
          : null,
        paymentStatus: appointment.payment?.status ?? null,
      })),
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
      },
    };
  }
}
