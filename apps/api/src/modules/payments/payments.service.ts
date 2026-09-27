import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { DomainEventsService } from '../../infrastructure/domain-events/domain-events.service';
import { AccountingService } from '../accounting/accounting.service';
import { CommerceFinanceSyncService } from '../finance/commerce-finance-sync.service';
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
    private readonly organizationScope: OrganizationScopeService,
    private readonly accountingService: AccountingService,
    private readonly commerceFinanceSync: CommerceFinanceSyncService,
    @Optional()
    private readonly domainEvents?: DomainEventsService,
  ) {}

  private getTenantId(): string {
    return this.tenantContext.getTenantId();
  }

  private async currentUserId(
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<string> {
    const context = this.tenantContext.getContext();
    const rows = await db.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT "userId" AS "userId"
         FROM memberships
        WHERE id=$1::text AND "tenantId"=$2::text AND "companyId"=$3::text
        LIMIT 1`,
      context.membershipId,
      context.tenantId,
      context.companyId,
    );
    if (!rows[0]?.userId) {
      throw new BadRequestException('Oturum açmış kullanıcı bilgisi bulunamadı.');
    }
    return rows[0].userId;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private async buildPeriodMetrics(
    from: Date,
    to: Date,
  ) {
    const branchScope = await this.organizationScope.getBranchScopedWhere();

    const [summary, appointments, newCustomers] =
      await Promise.all([
        this.summary({
          from,
          to,
        }),
        this.prisma.appointment.findMany({
          where: {
            ...branchScope,
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
            ...branchScope,
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
    const companyId = this.tenantContext.getCompanyId();
    const appointmentScope = await this.organizationScope.getBranchScopedWhere();

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        ...appointmentScope,
      },
      include: {
        customer: {
          select: { firstName: true, lastName: true },
        },
        service: {
          select: { name: true, price: true },
        },
        session: {
          select: { id: true },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Randevu bulunamadı.');
    }

    if (
      appointment.status === 'CANCELLED' ||
      appointment.status === 'NO_SHOW'
    ) {
      throw new BadRequestException(
        'İptal edilmiş veya gelmedi olarak işaretlenmiş randevu için ödeme alınamaz.',
      );
    }

    if (appointment.session) {
      throw new BadRequestException(
        'Bu randevu paket seansından karşılanıyor. Ayrıca ödeme alınamaz.',
      );
    }

    const serviceAmount = Number(appointment.service.price);
    const paymentAmount = Math.round((Number(input.amount) + Number.EPSILON) * 100) / 100;
    if (Math.abs(paymentAmount - serviceAmount) > 0.01) {
      throw new BadRequestException(
        'Randevu ödeme tutarı hizmet bedeliyle aynı olmalıdır. Kısmi tahsilat için randevunun alacak kaydını Finans > Gelirler alanından yönetin.',
      );
    }

    try {
      let eventId: string | null = null;
      const payment = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.payment.findUnique({
            where: { appointmentId: appointment.id },
            select: { id: true },
          });
          if (existing) {
            throw new ConflictException('Bu randevu için ödeme zaten kaydedilmiş.');
          }

          const payment = await tx.payment.create({
            data: {
              tenantId,
              appointmentId: appointment.id,
              amount: paymentAmount,
              method: input.method,
              ...(input.paidAt ? { paidAt: input.paidAt } : {}),
            },
          });

          const actorId = await this.currentUserId(tx);
          const customerName =
            `${appointment.customer.firstName} ${appointment.customer.lastName}`.trim();

          await this.accountingService.recordAppointmentReceivable(
            tx,
            appointment.id,
            {
              tenantId,
              branchId: appointment.branchId,
              entryDate: payment.paidAt,
              amount: serviceAmount,
            },
          );
          await this.commerceFinanceSync.syncAppointmentReceivable(tx, {
            tenantId,
            companyId,
            branchId: appointment.branchId,
            appointmentId: appointment.id,
            actorId,
            customerName,
            serviceName: appointment.service.name,
            amount: serviceAmount,
            occurredAt: payment.paidAt,
            dueAt: appointment.startAt,
          });

          await this.accountingService.recordAppointmentPayment(
            tx,
            payment.id,
            payment.method,
            {
              tenantId,
              branchId: appointment.branchId,
              entryDate: payment.paidAt,
              amount: paymentAmount,
            },
          );
          await this.commerceFinanceSync.syncAppointmentPayment(tx, {
            tenantId,
            companyId,
            branchId: appointment.branchId,
            appointmentId: appointment.id,
            actorId,
            customerName,
            serviceName: appointment.service.name,
            amount: paymentAmount,
            occurredAt: payment.paidAt,
            dueAt: appointment.startAt,
            paymentId: payment.id,
            method: payment.method,
          });

          eventId =
            (await this.domainEvents?.record(tx, {
              eventName: 'appointment.payment_received',
              aggregateType: 'appointment',
              aggregateId: appointment.id,
              payload: {
                paymentId: payment.id,
                amount: Number(payment.amount),
                method: payment.method,
              },
            })) ?? null;

          return payment;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (eventId) await this.domainEvents?.dispatchStored(eventId);
      return payment;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Bu randevu için ödeme zaten kaydedilmiş.');
      }
      throw error;
    }
  }

  async findAll(input: ListPaymentsInput) {
    const skip = (input.page - 1) * input.limit;
    const paymentScope = await this.organizationScope.getPaymentScopedWhere();

    const where = {
      ...paymentScope,
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
    const companyId = this.tenantContext.getCompanyId();
    const paymentScope = await this.organizationScope.getPaymentScopedWhere();

    const payment = await this.prisma.payment.findFirst({
      where: {
        id,
        ...paymentScope,
      },
      include: {
        appointment: {
          include: {
            customer: {
              select: { firstName: true, lastName: true },
            },
            service: {
              select: { name: true, price: true },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı.');
    }

    if (payment.status === 'REFUNDED') {
      throw new ConflictException('Ödeme zaten iade edilmiş.');
    }

    const reason = input.reason?.trim() || 'Ödeme iadesi';
    let eventId: string | null = null;
    const result = await this.prisma.$transaction(
      async (tx) => {
        const refundedAt = new Date();
        const result = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: { not: 'REFUNDED' },
          },
          data: {
            status: 'REFUNDED',
            refundedAt,
            refundReason: reason,
          },
        });

        if (result.count !== 1) {
          throw new ConflictException('Ödeme zaten iade edilmiş.');
        }

        await this.accountingService.recordAppointmentPaymentRefund(
          tx,
          payment.id,
          payment.method,
          {
            tenantId,
            branchId: payment.appointment.branchId,
            entryDate: refundedAt,
            amount: Number(payment.amount),
          },
        );

        const actorId = await this.currentUserId(tx);
        await this.commerceFinanceSync.syncAppointmentPaymentRefund(tx, {
          tenantId,
          companyId,
          branchId: payment.appointment.branchId,
          appointmentId: payment.appointmentId,
          actorId,
          customerName:
            `${payment.appointment.customer.firstName} ${payment.appointment.customer.lastName}`.trim(),
          serviceName: payment.appointment.service.name,
          amount: Number(payment.amount),
          occurredAt: refundedAt,
          dueAt: payment.appointment.startAt,
          paymentId: payment.id,
          method: payment.method,
          reason,
        });

        eventId =
          (await this.domainEvents?.record(tx, {
            eventName: 'appointment.payment_refunded',
            aggregateType: 'appointment',
            aggregateId: payment.appointmentId,
            payload: {
              paymentId: payment.id,
              amount: Number(payment.amount),
              reason,
            },
          })) ?? null;

        return tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (eventId) await this.domainEvents?.dispatchStored(eventId);
    return result;
  }

  async summary(input: PaymentSummaryInput) {
    const paymentScope = await this.organizationScope.getPaymentScopedWhere();

    const [completed, refunded] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          ...paymentScope,
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
          ...paymentScope,
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
        ...paymentScope,
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
    const now = new Date();
    const branchScope = await this.organizationScope.getBranchScopedWhere();

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
          ...branchScope,
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
        where: branchScope,
      }),
      this.prisma.staff.count({
        where: {
          ...branchScope,
          status: 'ACTIVE',
        },
      }),
      this.prisma.service.count({
        where: {
          ...branchScope,
          status: 'ACTIVE',
        },
      }),
      this.prisma.staff.findMany({
        where: {
          ...branchScope,
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
          ...branchScope,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          ...branchScope,
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
          where: branchScope,
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
    const paymentScope = await this.organizationScope.getPaymentScopedWhere();

    const payment =
      await this.prisma.payment.findFirst({
        where: {
          id,
          ...paymentScope,
        },
        include: {
          appointment: true,
        },
      });

    if (!payment) {
      throw new NotFoundException(
        'Ödeme bulunamadı.',
      );
    }

    return payment;
  }
}
