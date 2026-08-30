import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { CreateStaffInput } from './dto/create-staff.dto';
import { ListStaffInput } from './dto/list-staff.dto';
import { UpdateStaffInput } from './dto/update-staff.dto';
import { StaffPerformanceInput } from './dto/staff-performance.dto';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
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

  private getStaffScope() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();

    // CENTRAL + no active branch = company-wide view.
    if (roleScope === 'CENTRAL' && branchId === null) {
      return {
        tenantId,
        branch: {
          companyId,
        },
      };
    }

    // COMPANY / BRANCH, or CENTRAL with an active branch,
    // are restricted to the active branch.
    return {
      tenantId,
      branchId: this.requireBranchId(),
    };
  }

  private async validateBranchAccess(
    branchId: string,
  ): Promise<void> {
    const companyId = this.tenantContext.getCompanyId();

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
  }

  async create(input: CreateStaffInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    await this.validateBranchAccess(branchId);

    return this.prisma.staff.create({
      data: {
        tenantId,
        branchId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
      },
    });
  }

  async findAll(input: ListStaffInput) {
    const { page, limit, search, status } = input;
    const skip = (page - 1) * limit;

    const scope = this.getStaffScope();

    const where = {
      ...scope,

      ...(status ? { status } : {}),

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
      this.prisma.staff.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.staff.count({
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

  async performance(input: StaffPerformanceInput) {
    const scope = this.getStaffScope();

    const [staff, appointments] = await Promise.all([
      this.prisma.staff.findMany({
        where: scope,
        orderBy: {
          firstName: 'asc',
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
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
          staffId: true,
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

    return staff.map((member) => {
      const memberAppointments = appointments.filter(
        (appointment) => appointment.staffId === member.id,
      );

      const completedAppointments =
        memberAppointments.filter(
          (appointment) => appointment.status === 'COMPLETED',
        ).length;

      const collected = memberAppointments.reduce(
        (total, appointment) => {
          if (appointment.payment?.status !== 'COMPLETED') {
            return total;
          }

          return total + Number(appointment.payment.amount);
        },
        0,
      );

      return {
        staff: member,
        appointmentCount: memberAppointments.length,
        completedAppointments,
        collected,
      };
    });
  }

  async findOne(id: string) {
    const scope = this.getStaffScope();

    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        ...scope,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    return staff;
  }

  async update(id: string, input: UpdateStaffInput) {
    const scope = this.getStaffScope();

    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        ...scope,
      },
      select: {
        id: true,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    return this.prisma.staff.update({
      where: {
        id: staff.id,
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

  async archive(id: string) {
    const scope = this.getStaffScope();

    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        ...scope,
      },
      select: {
        id: true,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    const archived = await this.prisma.staff.update({
      where: {
        id: staff.id,
      },
      data: {
        status: 'ARCHIVED',
      },
    });

    return {
      archived: true,
      staff: archived,
    };
  }
}