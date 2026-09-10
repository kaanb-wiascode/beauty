import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AccountingService } from '../accounting/accounting.service';
import { calculateSaleTotals } from '../commerce/domain/sale-calculator';
import { InstallmentsService } from '../installments/installments.service';

interface CreateSaleInput {
  customerId: string;
  discountTotal: number;
  items: Array<{
    type: 'SERVICE' | 'PACKAGE';
    referenceId: string;
    quantity: number;
  }>;
}

interface AddSalePaymentInput {
  amount: number;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  reference?: string;
  note?: string;
}

interface RefundSalePaymentInput {
  reason: string;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly installmentsService: InstallmentsService,
    private readonly accountingService: AccountingService,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return branchId;
  }

  private async paymentSummary(saleId: string, tenantId: string, branchId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId, branchId },
      select: { id: true, total: true, status: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');

    const aggregate = await this.prisma.salePayment.aggregate({
      where: { saleId, tenantId, branchId, status: 'COMPLETED' },
      _sum: { amount: true },
    });

    const total = Number(sale.total);
    const paid = Number(aggregate._sum.amount ?? 0);
    const balance = Math.max(0, Math.round((total - paid + Number.EPSILON) * 100) / 100);

    return {
      saleId: sale.id,
      saleStatus: sale.status,
      total,
      paid,
      balance,
      paymentStatus: paid <= 0 ? 'UNPAID' : balance > 0 ? 'PARTIALLY_PAID' : 'PAID',
    };
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
      include: { customer: true, items: true, customerPackages: true, payments: true },
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
        payments: { orderBy: { paidAt: 'desc' } },
        installmentPlan: { include: { installments: { orderBy: { sequence: 'asc' } } } },
        customerPackages: { include: { sessions: true, package: true } },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async getPaymentSummary(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.paymentSummary(id, tenantId, branchId);
  }

  async addPayment(id: string, input: AddSalePaymentInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, tenantId, branchId },
        select: { id: true, total: true, status: true },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== 'CONFIRMED') {
        throw new BadRequestException('Payments can only be recorded for confirmed sales.');
      }

      const aggregate = await tx.salePayment.aggregate({
        where: { saleId: sale.id, tenantId, branchId, status: 'COMPLETED' },
        _sum: { amount: true },
      });

      const paid = Number(aggregate._sum.amount ?? 0);
      const total = Number(sale.total);
      const remaining = Math.round((total - paid + Number.EPSILON) * 100) / 100;
      const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;

      if (remaining <= 0) {
        throw new BadRequestException('Sale is already fully paid.');
      }
      if (amount > remaining) {
        throw new BadRequestException(`Payment exceeds remaining balance of ${remaining.toFixed(2)}.`);
      }

      const createdPayment = await tx.salePayment.create({
        data: {
          tenantId,
          branchId,
          saleId: sale.id,
          amount,
          method: input.method,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
        },
      });

      await this.installmentsService.allocatePayment(tx, sale.id, createdPayment.id, amount);
      await this.accountingService.recordSalePayment(
        tx,
        createdPayment.id,
        createdPayment.method,
        {
          tenantId,
          branchId,
          entryDate: createdPayment.paidAt,
          amount,
        },
      );
      return createdPayment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      payment,
      summary: await this.paymentSummary(id, tenantId, branchId),
    };
  }

  async refundPayment(saleId: string, paymentId: string, input: RefundSalePaymentInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('Refund reason is required.');

    const payment = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, tenantId, branchId }, select: { id: true } });
      if (!sale) throw new NotFoundException('Sale not found');

      const existing = await tx.salePayment.findFirst({
        where: { id: paymentId, saleId, tenantId, branchId },
      });
      if (!existing) throw new NotFoundException('Sale payment not found');
      if (existing.status !== 'COMPLETED') {
        throw new BadRequestException('Only completed payments can be refunded.');
      }

      const refundedAt = new Date();
      const updatedPayment = await tx.salePayment.update({
        where: { id: existing.id },
        data: {
          status: 'REFUNDED',
          refundedAt,
          refundReason: reason,
        },
      });

      await this.accountingService.recordSalePaymentRefund(
        tx,
        existing.id,
        existing.method,
        {
          tenantId,
          branchId,
          entryDate: refundedAt,
          amount: Number(existing.amount),
        },
      );

      return updatedPayment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      payment,
      summary: await this.paymentSummary(saleId, tenantId, branchId),
    };
  }

  async confirm(id: string) {
    const sale = await this.findOne(id);
    if (sale.status !== 'DRAFT') {
      throw new BadRequestException('Only draft sales can be confirmed.');
    }

    const packageItems = sale.items.filter((item) => item.type === 'PACKAGE' && item.packageId);

    return this.prisma.$transaction(async (tx) => {
      const confirmedAt = new Date();
      const claimed = await tx.sale.updateMany({
        where: {
          id: sale.id,
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          status: 'DRAFT',
        },
        data: { status: 'CONFIRMED', confirmedAt },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Sale is no longer in a confirmable state.');
      }

      for (const line of packageItems) {
        const definition = await tx.servicePackage.findFirst({
          where: {
            id: line.packageId!,
            tenantId: sale.tenantId,
            branchId: sale.branchId,
            active: true,
          },
          include: { items: true },
        });
        if (!definition) {
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

      await this.accountingService.recordSaleConfirmed(tx, sale.id, {
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        entryDate: confirmedAt,
        amount: Number(sale.total),
      });

      return tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          items: true,
          payments: true,
          installmentPlan: { include: { installments: { orderBy: { sequence: 'asc' } } } },
          customerPackages: { include: { package: true, sessions: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
