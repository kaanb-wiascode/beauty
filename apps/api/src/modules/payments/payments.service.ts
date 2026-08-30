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

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return branchId;
  }

  /**
   * CENTRAL without an active branch may see the whole company.
   * Once a branch is selected, all branch-scoped operations are
   * restricted to that branch.
   */
  private getAppointmentScope() {
    const tenantId = this.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (roleScope === 'CENTRAL' && branchId === null) {
      return {
        tenantId,
        branch: {
          companyId,
        },
      };
    }

    return {
      tenantId,
      branchId: this.requireBranchId(),
    };
  }

  /**
   * Payments do not have branchId directly; branch isolation is
   * enforced through the related appointment.
   */
  private getPaymentScope() {
    const tenantId = this.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (roleScope === 'CENTRAL' && branchId === null) {
      return {
        tenantId,
        appointment: {
          branch: {
            companyId,
          },
        },
      };
    }

    return {
      tenantId,
      appointment: {
        branchId: this.requireBranchId(),
      },
    };
  }

  private getBranchEntityScope() {
    const tenantId = this.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    if (roleScope === 'CENTRAL' && branchId === null) {
      return {
        tenantId,
        branch: {
          companyId,
        },
      };
    }

    return {
      tenantId,
      branchId: this.requireBranchId(),
    };
  }

  private async buildPeriodMetrics(
    from: Date,
    to: Date,
  ) {
    const tenantId = this.getTenantId();

    const [summary, appointments, newCustomers] =
      await Promise.all([
        this.summary({
          from,
          to,
        }),
        this.prisma.appointment.findMany({
          where: {
            ...this.getAppointmentScope(),
            startAt: {
              gte: from,
              lte: to,
            },
          },
          select: {
            status: true,
          },
        }),
        this.prisma.customer.count({
          where: {
            ...this.getBranchEntityScope(),
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
      ]);

    return {
      gross: summary.gross,
      refunds: summary.refunds,
      net: summary.net,
      appointmentCount: appointments.length,
      completedAppointments: appointments.filter(
        (appointment) => appointment.status === 'COMPLETED',
      ).length,
      cancelledAppointments: appointments.filter(
        (appointment) => appointment.status === 'CANCELLED',
      ).length,
      noShowAppointments: appointments.filter(
        (appointment) => appointment.status === 'NO_SHOW',
      ).length,
      newCustomers,
    };
  }

  async create(input: CreatePaymentInput) {
    const tenantId = this.getTenantId();

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          ...this.getAppointmentScope(),
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
      ...this.getPaymentScope(),
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
        ...this.getPaymentScope(),
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
          ...this.getPaymentScope(),
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
          ...this.getPaymentScope(),
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
        ...this.getPaymentScope(),
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

    const last7From = new Date(input.from);
    last7From.setDate(last7From.getDate() - 6);

    const monthFrom = new Date(input.from);
    monthFrom.setDate(1);
    monthFrom.setHours(0, 0, 0, 0);

    const [
      summary,
      appointments,
      customerCount,
      activeStaff,
      activeServices,
      activeStaffList,
      activeServiceList,
      upcomingAppointments,
      last7Metrics,
      monthMetrics,
    ] = await Promise.all([
      this.summary({
        from: input.from,
        to: input.to,
      }),
      this.prisma.appointment.findMany({
        where: {
          ...this.getAppointmentScope(),
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
        where: this.getBranchEntityScope(),
      }),
      this.prisma.staff.count({
        where: {
          ...this.getBranchEntityScope(),
          status: 'ACTIVE',
        },
      }),
      this.prisma.service.count({
        where: {
          ...this.getBranchEntityScope(),
          status: 'ACTIVE',
        },
      }),
      this.prisma.staff.findMany({
        where: {
          ...this.getBranchEntityScope(),
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
          ...this.getBranchEntityScope(),
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          ...this.getAppointmentScope(),
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
      this.buildPeriodMetrics(last7From, input.to),
      this.buildPeriodMetrics(monthFrom, input.to),
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
          where: this.getAppointmentScope(),
        }),
      },

      paymentBreakdown: summary.methods,

      todayAppointments: appointmentDetails,

      upcomingAppointments: upcomingDetails,

      periods: {
        last7Days: last7Metrics,
        month: monthMetrics,
      },

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
          ...this.getPaymentScope(),
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
