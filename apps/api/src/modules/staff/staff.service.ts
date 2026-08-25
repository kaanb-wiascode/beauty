import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { CreateStaffInput } from './dto/create-staff.dto';
import { ListStaffInput } from './dto/list-staff.dto';
import { UpdateStaffInput } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async create(input: CreateStaffInput) {
    const tenantId = this.tenantContext.getTenantId();

    return this.prisma.staff.create({
      data: {
        tenantId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
      },
    });
  }

  async findAll(input: ListStaffInput) {
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

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();

    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    return staff;
  }

  async update(id: string, input: UpdateStaffInput) {
    const tenantId = this.tenantContext.getTenantId();

    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        tenantId,
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
    const tenantId = this.tenantContext.getTenantId();

    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        tenantId,
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
