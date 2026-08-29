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
    const now = new Date();

    const [
      summary,
      appointments,
      customerCount,
      activeStaff,
      activeServices,
      activeStaffList,
      activeServiceList,
      upcomingAppointments,
    ] = await Promise.all([
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
        orderBy: {
          startAt: 'asc',
        },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
            },
          },
          payment: {
            select: {
              id: true,
              amount: true,
              method: true,
              status: true,
              paidAt: true,
            },
          },
        },
      }),
      this.prisma.customer.count({
        where: {
          tenantId,
        },
      }),
      this.prisma.staff.count({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      }),
      this.prisma.service.count({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      }),
      this.prisma.staff.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      }),
      this.prisma.service.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          startAt: {
            gt: now,
          },
          status: {
            in: ['SCHEDULED', 'CONFIRMED'],
          },
        },
        orderBy: {
          startAt: 'asc',
        },
        take: 5,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
            },
          },
          payment: {
            select: {
              id: true,
              amount: true,
              method: true,
              status: true,
              paidAt: true,
            },
          },
        },
      }),
    ]);

    const appointmentCounts = {
      total: appointments.length,
      scheduled: appointments.filter(
        (appointment) => appointment.status === 'SCHEDULED',
      ).length,
      confirmed: appointments.filter(
        (appointment) => appointment.status === 'CONFIRMED',
      ).length,
      completed: appointments.filter(
        (appointment) => appointment.status === 'COMPLETED',
      ).length,
      cancelled: appointments.filter(
        (appointment) => appointment.status === 'CANCELLED',
      ).length,
      noShow: appointments.filter(
        (appointment) => appointment.status === 'NO_SHOW',
      ).length,
    };

    const appointmentDetails = appointments.map((appointment) => ({
      id: appointment.id,
      customer: appointment.customer,
      staff: appointment.staff,
      service: appointment.service,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      notes: appointment.notes,
      payment: appointment.payment
        ? {
            id: appointment.payment.id,
            amount: Number(appointment.payment.amount),
            method: appointment.payment.method,
            status: appointment.payment.status,
            paidAt: appointment.payment.paidAt,
          }
        : null,
    }));

    const upcomingDetails = upcomingAppointments.map((appointment) => ({
      id: appointment.id,
      customer: appointment.customer,
      staff: appointment.staff,
      service: appointment.service,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      notes: appointment.notes,
      payment: appointment.payment
        ? {
            id: appointment.payment.id,
            amount: Number(appointment.payment.amount),
            method: appointment.payment.method,
            status: appointment.payment.status,
            paidAt: appointment.payment.paidAt,
          }
        : null,
    }));

    const serviceMap = new Map<
      string,
      { id: string; name: string; collected: number; appointmentCount: number }
    >(
      activeServiceList.map((service) => [
        service.id,
        {
          id: service.id,
          name: service.name,
          collected: 0,
          appointmentCount: 0,
        },
      ]),
    );

    const staffMap = new Map<
      string,
      { id: string; name: string; collected: number; appointmentCount: number }
    >(
      activeStaffList.map((member) => [
        member.id,
        {
          id: member.id,
          name: `${member.firstName} ${member.lastName}`.trim(),
          collected: 0,
          appointmentCount: 0,
        },
      ]),
    );

    for (const appointment of appointments) {
      const service = serviceMap.get(appointment.serviceId);
      if (service) {
        service.appointmentCount += 1;

        if (appointment.payment?.status === 'COMPLETED') {
          service.collected += Number(appointment.payment.amount);
        }
      }

      const staff = staffMap.get(appointment.staffId);
      if (staff) {
        staff.appointmentCount += 1;

        if (appointment.payment?.status === 'COMPLETED') {
          staff.collected += Number(appointment.payment.amount);
        }
      }
    }

    const servicePerformance = [...serviceMap.values()]
      .sort((a, b) => b.collected - a.collected)
      .slice(0, 5);

    const staffPerformance = [...staffMap.values()]
      .sort((a, b) => b.collected - a.collected)
      .slice(0, 5);

    return {
      summary: {
        ...summary,
        appointmentCount: appointmentCounts.total,
        completedAppointments: appointmentCounts.completed,
        scheduledAppointments: appointmentCounts.scheduled,
        confirmedAppointments: appointmentCounts.confirmed,
        cancelledAppointments: appointmentCounts.cancelled,
        noShowAppointments: appointmentCounts.noShow,
      },

      totals: {
        customers: customerCount,
        activeStaff,
        activeServices,
        appointments: await this.prisma.appointment.count({
          where: {
            tenantId,
          },
        }),
      },

      paymentBreakdown: summary.methods,

      todayAppointments: appointmentDetails,

      upcomingAppointments: upcomingDetails,

      topService: servicePerformance[0] ?? null,

      topStaff: staffPerformance[0] ?? null,

      servicePerformance,

      staffPerformance,
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
