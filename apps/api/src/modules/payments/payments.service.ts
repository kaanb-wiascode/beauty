import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { CreatePaymentInput } from './dto/create-payment.dto';
import { ListPaymentsInput } from './dto/list-payments.dto';
import { RefundPaymentInput } from './dto/refund-payment.dto';
import { DashboardReportInput } from './dto/dashboard-report.dto';
import { PaymentSummaryInput } from './dto/payment-summary.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private getTenantId(): string {
    return this.tenantContext.getTenantId();
  }

  async create(input: CreatePaymentInput) {
    const tenantId = this.getTenantId();

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          tenantId,
        },
        include: {
          service: {
            select: {
              price: true,
            },
          },
        },
      });

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found',
      );
    }

    if (
      appointment.status === 'CANCELLED' ||
      appointment.status === 'NO_SHOW'
    ) {
      throw new BadRequestException(
        'Cancelled or no-show appointment cannot be paid',
      );
    }

    const existing = await this.prisma.payment.findUnique({
      where: {
        appointmentId: appointment.id,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Appointment already has a payment',
      );
    }

    return this.prisma.payment.create({
      data: {
        tenantId,
        appointmentId: appointment.id,
        amount: input.amount,
        method: input.method,
        ...(input.paidAt
          ? { paidAt: input.paidAt }
          : {}),
      },
    });
  }

  async findAll(input: ListPaymentsInput) {
    const tenantId = this.getTenantId();

    const skip = (input.page - 1) * input.limit;

    const where = {
      tenantId,
      ...(input.method
        ? { method: input.method }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: input.limit,
        orderBy: {
          paidAt: 'desc',
        },
        include: {
          appointment: {
            select: {
              id: true,
              customerId: true,
              staffId: true,
              serviceId: true,
              startAt: true,
              endAt: true,
              status: true,
            },
          },
        },
      }),

      this.prisma.payment.count({
        where,
      }),
    ]);

    return {
      data,
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(
          total / input.limit,
        ),
      },
    };
  }

  async refund(id: string, input: RefundPaymentInput) {
    const tenantId = this.getTenantId();

    const payment = await this.prisma.payment.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'REFUNDED') {
      throw new ConflictException(
        'Payment is already refunded',
      );
    }

    return this.prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundReason: input.reason?.trim() || null,
      },
    });
  }

  async summary(input: PaymentSummaryInput) {
    const tenantId = this.getTenantId();

    const [completed, refunded] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          tenantId,
          status: 'COMPLETED',
          paidAt: {
            gte: input.from,
            lte: input.to,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),

      this.prisma.payment.aggregate({
        where: {
          tenantId,
          status: 'REFUNDED',
          refundedAt: {
            gte: input.from,
            lte: input.to,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const methods = await this.prisma.payment.groupBy({
      by: ['method'],
      where: {
        tenantId,
        status: 'COMPLETED',
        paidAt: {
          gte: input.from,
          lte: input.to,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const gross = Number(completed._sum.amount ?? 0);
    const refunds = Number(refunded._sum.amount ?? 0);

    return {
      gross,
      refunds,
      net: gross - refunds,
      paymentCount: completed._count._all,
      refundCount: refunded._count._all,
      methods: {
        CASH: Number(
          methods.find((item) => item.method === 'CASH')?._sum.amount ?? 0,
        ),
        CARD: Number(
          methods.find((item) => item.method === 'CARD')?._sum.amount ?? 0,
        ),
        TRANSFER: Number(
          methods.find((item) => item.method === 'TRANSFER')?._sum.amount ?? 0,
        ),
      },
    };
  }


    async dashboardReport(input: DashboardReportInput) {
      const tenantId = this.getTenantId();

      const [summary, appointments, services, staff] =
        await Promise.all([
          this.summary({
            from: input.from,
            to: input.to,
          }),
          this.prisma.appointment.findMany({
            where: {
              tenantId,
              startAt: {
                gte: input.from,
                lte: input.to,
              },
            },
            select: {
              id: true,
              status: true,
            },
          }),
          this.prisma.service.findMany({
            where: {
              tenantId,
            },
            select: {
              id: true,
              name: true,
            },
          }),
          this.prisma.staff.findMany({
            where: {
              tenantId,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          }),
        ]);

      const completedAppointments = appointments.filter(
        (appointment) =>
          appointment.status === 'COMPLETED',
      ).length;

      const servicePerformance =
        await Promise.all(
          services.map(async (service) => {
            const rows =
              await this.prisma.appointment.findMany({
                where: {
                  tenantId,
                  serviceId: service.id,
                  startAt: {
                    gte: input.from,
                    lte: input.to,
                  },
                },
                select: {
                  payment: {
                    select: {
                      amount: true,
                      status: true,
                    },
                  },
                },
              });

            const collected = rows.reduce(
              (total, row) => {
                if (
                  row.payment?.status !== 'COMPLETED'
                ) {
                  return total;
                }

                return (
                  total +
                  Number(row.payment.amount)
                );
              },
              0,
            );

            return {
              id: service.id,
              name: service.name,
              collected,
              appointmentCount: rows.length,
            };
          }),
        );

      const staffPerformance =
        await Promise.all(
          staff.map(async (member) => {
            const rows =
              await this.prisma.appointment.findMany({
                where: {
                  tenantId,
                  staffId: member.id,
                  startAt: {
                    gte: input.from,
                    lte: input.to,
                  },
                },
                select: {
                  payment: {
                    select: {
                      amount: true,
                      status: true,
                    },
                  },
                },
              });

            const collected = rows.reduce(
              (total, row) => {
                if (
                  row.payment?.status !== 'COMPLETED'
                ) {
                  return total;
                }

                return (
                  total +
                  Number(row.payment.amount)
                );
              },
              0,
            );

            return {
              id: member.id,
              name:
                `${member.firstName} ${member.lastName}`.trim(),
              collected,
              appointmentCount: rows.length,
            };
          }),
        );

      return {
        summary: {
          ...summary,
          appointmentCount: appointments.length,
          completedAppointments,
        },
        topService:
          servicePerformance
            .sort(
              (a, b) => b.collected - a.collected,
            )[0] ?? null,
        topStaff:
          staffPerformance
            .sort(
              (a, b) => b.collected - a.collected,
            )[0] ?? null,
        servicePerformance: servicePerformance.slice(0, 5),
        staffPerformance: staffPerformance.slice(0, 5),
      };
    }


  async findOne(id: string) {
    const tenantId = this.getTenantId();

    const payment =
      await this.prisma.payment.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          appointment: true,
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    return payment;
  }
}
