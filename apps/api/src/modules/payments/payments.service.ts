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
