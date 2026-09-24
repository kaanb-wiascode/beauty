import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
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
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();

    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return branchId;
  }

  private async validateBranchAccess(
    branchId: string,
  ): Promise<void> {
    const companyId = this.tenantContext.getCompanyId();
    const roleScope = this.tenantContext.getRoleScope();

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (roleScope === 'CENTRAL') {
      return;
    }

    const assignedBranchIds =
      await this.organizationScope.getAssignedActiveBranchIds();

    if (!assignedBranchIds.includes(branchId)) {
      throw new NotFoundException('Branch not found');
    }
  }

  async create(input: CreateServiceInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    await this.validateBranchAccess(branchId);

    return this.prisma.service.create({
      data: {
        tenantId,
        branchId,
        name: input.name.trim(),
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        durationMinutes: input.durationMinutes,
        preparationMinutes: input.preparationMinutes,
        cleanupMinutes: input.cleanupMinutes,
        price: input.price,
        cost: input.cost ?? null,
        taxRate: input.taxRate,
        currency: input.currency,
        requiresConsultation: input.requiresConsultation,
      },
    });
  }

  async findAll(input: ListServicesInput) {
    const { page, limit, search, status } = input;
    const skip = (page - 1) * limit;

    const scope = await this.organizationScope.getBranchScopedWhere();

    const where = {
      ...scope,
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
    const scope = await this.organizationScope.getBranchScopedWhere();

    const [services, appointments] = await Promise.all([
      this.prisma.service.findMany({
        where: scope,
        orderBy: {
          name: 'asc',
        },
        select: {
          id: true,
          name: true,
          price: true,
          status: true,
          branchId: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          ...scope,
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
    const scope = await this.organizationScope.getBranchScopedWhere();

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        ...scope,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async update(id: string, input: UpdateServiceInput) {
    const scope = await this.organizationScope.getBranchScopedWhere();

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        ...scope,
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
        ...(input.category !== undefined && {
          category: input.category?.trim() || null,
        }),
        ...(input.description !== undefined && {
          description:
            input.description?.trim() || null,
        }),
        ...(input.durationMinutes !== undefined && {
          durationMinutes: input.durationMinutes,
        }),
        ...(input.preparationMinutes !== undefined && {
          preparationMinutes: input.preparationMinutes,
        }),
        ...(input.cleanupMinutes !== undefined && {
          cleanupMinutes: input.cleanupMinutes,
        }),
        ...(input.price !== undefined && {
          price: input.price,
        }),
        ...(input.cost !== undefined && {
          cost: input.cost,
        }),
        ...(input.taxRate !== undefined && {
          taxRate: input.taxRate,
        }),
        ...(input.currency !== undefined && {
          currency: input.currency,
        }),
        ...(input.requiresConsultation !== undefined && {
          requiresConsultation: input.requiresConsultation,
        }),
      },
    });
  }

  async archive(id: string) {
    const scope = await this.organizationScope.getBranchScopedWhere();

    const service = await this.prisma.service.findFirst({
      where: {
        id,
        ...scope,
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
