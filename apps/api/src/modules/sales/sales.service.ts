import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { calculateSaleTotals } from '../commerce/domain/sale-calculator';

interface CreateSaleInput {
  customerId: string;
  discountTotal: number;
  items: Array<{
    type: 'SERVICE' | 'PACKAGE';
    referenceId: string;
    quantity: number;
  }>;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return branchId;
  }

  async create(input: CreateSaleInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, tenantId, branchId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const lines = await Promise.all(input.items.map(async (item) => {
      if (item.type === 'SERVICE') {
        const service = await this.prisma.service.findFirst({
          where: { id: item.referenceId, tenantId, branchId, status: 'ACTIVE' },
        });
        if (!service) throw new BadRequestException('One or more sale services are invalid.');
        return {
          type: 'SERVICE' as const,
          serviceId: service.id,
          packageId: null,
          description: service.name,
          quantity: item.quantity,
          unitPrice: Number(service.price),
        };
      }

      const servicePackage = await this.prisma.servicePackage.findFirst({
        where: { id: item.referenceId, tenantId, branchId, active: true },
      });
      if (!servicePackage) throw new BadRequestException('One or more sale packages are invalid.');
      return {
        type: 'PACKAGE' as const,
        serviceId: null,
        packageId: servicePackage.id,
        description: servicePackage.name,
        quantity: item.quantity,
        unitPrice: Number(servicePackage.price),
      };
    }));

    const totals = calculateSaleTotals(lines, input.discountTotal);

    return this.prisma.sale.create({
      data: {
        tenantId,
        branchId,
        customerId: input.customerId,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
        items: {
          create: lines.map((line) => ({
            type: line.type,
            serviceId: line.serviceId,
            packageId: line.packageId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.quantity * line.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
  }

  async findAll() {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.prisma.sale.findMany({
      where: { tenantId, branchId },
      include: { customer: true, items: true, customerPackages: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId, branchId },
      include: {
        customer: true,
        items: true,
        customerPackages: { include: { sessions: true, package: true } },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async confirm(id: string) {
    const sale = await this.findOne(id);
    if (sale.status !== 'DRAFT') {
      throw new BadRequestException('Only draft sales can be confirmed.');
    }

    const packageItems = sale.items.filter((item) => item.type === 'PACKAGE' && item.packageId);

    return this.prisma.$transaction(async (tx) => {
      for (const line of packageItems) {
        const definition = await tx.servicePackage.findUnique({
          where: { id: line.packageId! },
          include: { items: true },
        });
        if (!definition || !definition.active) {
          throw new BadRequestException('A package in this sale is no longer available.');
        }

        for (let packageIndex = 0; packageIndex < line.quantity; packageIndex += 1) {
          const purchasedAt = new Date();
          const expiresAt = definition.validityDays
            ? new Date(purchasedAt.getTime() + definition.validityDays * 24 * 60 * 60 * 1000)
            : null;

          const customerPackage = await tx.customerPackage.create({
            data: {
              tenantId: sale.tenantId,
              branchId: sale.branchId,
              customerId: sale.customerId,
              packageId: definition.id,
              saleId: sale.id,
              purchasedAt,
              expiresAt,
            },
          });

          const sessions = definition.items.flatMap((item) =>
            Array.from({ length: item.quantity }, () => ({
              tenantId: sale.tenantId,
              branchId: sale.branchId,
              customerPackageId: customerPackage.id,
              serviceId: item.serviceId,
            })),
          );

          if (sessions.length > 0) {
            await tx.session.createMany({ data: sessions });
          }
        }
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      return tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          items: true,
          customerPackages: { include: { package: true, sessions: true } },
        },
      });
    });
  }

  async cancel(id: string) {
    const sale = await this.findOne(id);
    if (sale.status !== 'DRAFT') {
      throw new BadRequestException('Only draft sales can be cancelled in v1.');
    }
    return this.prisma.sale.update({
      where: { id: sale.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }
}
