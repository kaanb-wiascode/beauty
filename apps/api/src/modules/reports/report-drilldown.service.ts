import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import type { ReportDrilldownInput } from './dto/report-drilldown.dto';
import { reportKeys } from './report-definition';

@Injectable()
export class ReportDrilldownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffService: StaffService,
    private readonly servicesService: ServicesService,
  ) {}

  async drilldown(user: JwtPayload, input: ReportDrilldownInput) {
    if (input.reportKey === reportKeys.staffPerformance) {
      await this.staffService.findOne(input.rowId);
      return this.appointments(user, input, { staffId: input.rowId });
    }

    await this.servicesService.findOne(input.rowId);
    return this.appointments(user, input, { serviceId: input.rowId });
  }

  private async appointments(
    user: JwtPayload,
    input: ReportDrilldownInput,
    entity: { staffId: string } | { serviceId: string },
  ) {
    const skip = (input.page - 1) * input.limit;
    const where = {
      tenantId: user.tenantId,
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
          branchId: true,
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
