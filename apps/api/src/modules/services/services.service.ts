import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { CreateServiceInput } from './dto/create-service.dto';
import { ListServicesInput } from './dto/list-services.dto';
import { UpdateServiceInput } from './dto/update-service.dto';
import { ServicePerformanceInput } from './dto/service-performance.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async create(input: CreateServiceInput) {
    const tenantId = this.tenantContext.getTenantId();

    return this.prisma.service.create({
      data: {
        tenantId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        durationMinutes: input.durationMinutes,
        price: input.price,
      },
    });
  }

  async findAll(input: ListServicesInput) {
    const tenantId = this.tenantContext.getTenantId();

    const { page, limit, search, status } = input;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.service.count({
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


    async performance(input: ServicePerformanceInput) {
      const tenantId = this.tenantContext.getTenantId();

      const [services, appointments] = await Promise.all([
        this.prisma.service.findMany({
          where: {
            tenantId,
          },
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            name: true,
            price: true,
            status: true,
          },
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
            serviceId: true,
            status: true,
            payment: {
              select: {
                amount: true,
                status: true,
              },
            },
          },
        }),
      ]);

      return services.map((service) => {
        const serviceAppointments = appointments.filter(
          (appointment) =>
            appointment.serviceId === service.id,
        );

        const completedAppointments =
          serviceAppointments.filter(
            (appointment) =>
              appointment.status === 'COMPLETED',
          ).length;

        const collected = serviceAppointments.reduce(
          (total, appointment) => {
            if (
              appointment.payment?.status !== 'COMPLETED'
            ) {
              return total;
            }

            return (
              total +
              Number(appointment.payment.amount)
            );
          },
          0,
        );

        return {
          service,
          appointmentCount: serviceAppointments.length,
          completedAppointments,
          collected,
        };
      });
    }


  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async update(id: string, input: UpdateServiceInput) {
    const tenantId = this.tenantContext.getTenantId();

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return this.prisma.service.update({
      where: {
        id: service.id,
      },
      data: {
        ...(input.name !== undefined && {
          name: input.name.trim(),
        }),
        ...(input.description !== undefined && {
          description: input.description?.trim() || null,
        }),
        ...(input.durationMinutes !== undefined && {
          durationMinutes: input.durationMinutes,
        }),
        ...(input.price !== undefined && {
          price: input.price,
        }),
      },
    });
  }

  async archive(id: string) {
    const tenantId = this.tenantContext.getTenantId();

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const archived = await this.prisma.service.update({
      where: {
        id: service.id,
      },
      data: {
        status: 'ARCHIVED',
      },
    });

    return {
      archived: true,
      service: archived,
    };
  }
}
