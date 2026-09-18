import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import type { ReportDrilldownInput } from './dto/report-drilldown.dto';
import { reportKeys } from './report-definition';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportDrilldownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationScope: OrganizationScopeService,
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

    await this.assertBranchInScope(user, input.rowId);
    return this.appointments(input, { branchId: input.rowId });
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
      | { branchId: string },
  ) {
    const skip = (input.page - 1) * input.limit;
    const scope = await this.organizationScope.getBranchScopedWhere();
    const where = {
      ...scope,
      ...entity,
      startAt: {
        gte: input.filters.from,
        lte: input.filters.to,
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
