import {
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  
  import { PrismaService } from '@beauty-erp/database';
  
  import { TenantContext } from '../../common/tenant/tenant-context';
  import { CreateCustomerInput } from './dto/create-customer.dto';
  import { ListCustomersInput } from './dto/list-customers.dto';
  import { UpdateCustomerInput } from './dto/update-customer.dto';
  
  @Injectable()
  export class CustomersService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly tenantContext: TenantContext,
    ) {}
  
    async create(input: CreateCustomerInput) {
      const tenantId = this.tenantContext.getTenantId();
  
      return this.prisma.customer.create({
        data: {
          tenantId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
        },
      });
    }
  
    async findAll(input: ListCustomersInput) {
      const tenantId = this.tenantContext.getTenantId();
    
      const { page, limit, search } = input;
      const skip = (page - 1) * limit;
    
      const where = {
        tenantId,
        ...(search
          ? {
              OR: [
                {
                  firstName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  lastName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  phone: {
                    contains: search,
                  },
                },
              ],
            }
          : {}),
      };
    
      const [data, total] = await Promise.all([
        this.prisma.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
        }),
    
        this.prisma.customer.count({
          where,
        }),
      ]);
    
      return {
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  
    async findOne(id: string) {
      const tenantId = this.tenantContext.getTenantId();

      const customer = await this.prisma.customer.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          appointments: {
            where: {
              tenantId,
            },
            include: {
              service: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  durationMinutes: true,
                },
              },
              staff: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
              payment: {
                select: {
                  id: true,
                  amount: true,
                  method: true,
                  status: true,
                  paidAt: true,
                  refundedAt: true,
                  refundReason: true,
                },
              },
        },
            orderBy: {
              startAt: 'desc',
            },
          },
        },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found');
      }

      const totalAppointments = customer.appointments.length;

      const completedAppointments = customer.appointments.filter(
        (appointment) => appointment.status === 'COMPLETED',
      ).length;

      const upcomingAppointments = customer.appointments.filter(
        (appointment) =>
          appointment.startAt >= new Date() &&
          appointment.status !== 'CANCELLED' &&
          appointment.status !== 'NO_SHOW',
      ).length;

      const customerPayments = customer.appointments
        .filter((appointment) => appointment.payment)
        .map((appointment) => ({
          id: appointment.payment!.id,
          appointmentId: appointment.id,
          amount: Number(appointment.payment!.amount),
          method: appointment.payment!.method,
          status: appointment.payment!.status,
          paidAt: appointment.payment!.paidAt,
          refundedAt: appointment.payment!.refundedAt,
          refundReason: appointment.payment!.refundReason,
          service: {
            id: appointment.service.id,
            name: appointment.service.name,
          },
        }))
        .sort(
          (a, b) =>
            new Date(b.paidAt).getTime() -
            new Date(a.paidAt).getTime(),
        );

      const totalPaid = customerPayments
        .filter((payment) => payment.status === 'COMPLETED')
        .reduce((total, payment) => total + payment.amount, 0);

      const totalRefunded = customerPayments
        .filter((payment) => payment.status === 'REFUNDED')
        .reduce((total, payment) => total + payment.amount, 0);

      const totalSpent = totalPaid - totalRefunded;
      const lastPaymentAt = customerPayments[0]?.paidAt ?? null;

      return {
        id: customer.id,
        tenantId: customer.tenantId,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        email: customer.email,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        stats: {
          totalAppointments,
          completedAppointments,
          upcomingAppointments,
          totalSpent,
          totalPaid,
          totalRefunded,
          netSpent: totalSpent,
          lastPaymentAt,
        },
        payments: customerPayments,
        appointments: customer.appointments,
      };
    }
  
    async update(id: string, input: UpdateCustomerInput) {
      const tenantId = this.tenantContext.getTenantId();
  
      const customer = await this.prisma.customer.findFirst({
        where: {
          id,
          tenantId,
        },
        select: {
          id: true,
        },
      });
  
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
  
      return this.prisma.customer.update({
        where: {
          id: customer.id,
        },
        data: {
          ...(input.firstName !== undefined && {
            firstName: input.firstName.trim(),
          }),
          ...(input.lastName !== undefined && {
            lastName: input.lastName.trim(),
          }),
          ...(input.phone !== undefined && {
            phone: input.phone?.trim() || null,
          }),
          ...(input.email !== undefined && {
            email: input.email?.trim().toLowerCase() || null,
          }),
        },
      });
    }
  
    async remove(id: string) {
      const tenantId = this.tenantContext.getTenantId();
  
      const customer = await this.prisma.customer.findFirst({
        where: {
          id,
          tenantId,
        },
        select: {
          id: true,
        },
      });
  
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
  
      await this.prisma.customer.delete({
        where: {
          id: customer.id,
        },
      });
  
      return {
        deleted: true,
        id,
      };
    }
  }
