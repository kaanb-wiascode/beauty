import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface PackageItemInput {
  serviceId: string;
  quantity: number;
}

interface CreatePackageInput {
  name: string;
  description?: string;
  price: number;
  validityDays?: number;
  items: PackageItemInput[];
}

type UpdatePackageInput = Partial<CreatePackageInput>;

@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return branchId;
  }

  private async validateServices(items: PackageItemInput[], tenantId: string, branchId: string) {
    const ids = [...new Set(items.map((item) => item.serviceId))];
    if (ids.length !== items.length) {
      throw new BadRequestException('A service can only appear once in a package.');
    }

    const count = await this.prisma.service.count({
      where: { id: { in: ids }, tenantId, branchId, status: 'ACTIVE' },
    });

    if (count !== ids.length) {
      throw new BadRequestException('One or more package services are invalid or inactive.');
    }
  }

  async create(input: CreatePackageInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    await this.validateServices(input.items, tenantId, branchId);

    return this.prisma.servicePackage.create({
      data: {
        tenantId,
        branchId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        price: input.price,
        validityDays: input.validityDays ?? null,
        items: {
          create: input.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity })),
        },
      },
      include: { items: { include: { service: true } } },
    });
  }

  async findAll() {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.prisma.servicePackage.findMany({
      where: { tenantId, branchId },
      include: { items: { include: { service: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const item = await this.prisma.servicePackage.findFirst({
      where: { id, tenantId, branchId },
      include: { items: { include: { service: true } } },
    });
    if (!item) throw new NotFoundException('Package not found');
    return item;
  }

  async update(id: string, input: UpdatePackageInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    await this.findOne(id);
    if (input.items) await this.validateServices(input.items, tenantId, branchId);

    return this.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.packageItem.deleteMany({ where: { packageId: id } });
      }

      return tx.servicePackage.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.description !== undefined && { description: input.description?.trim() || null }),
          ...(input.price !== undefined && { price: input.price }),
          ...(input.validityDays !== undefined && { validityDays: input.validityDays }),
          ...(input.items && {
            items: { create: input.items.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity })) },
          }),
        },
        include: { items: { include: { service: true } } },
      });
    });
  }

  async archive(id: string) {
    await this.findOne(id);
    return this.prisma.servicePackage.update({ where: { id }, data: { active: false } });
  }
}
