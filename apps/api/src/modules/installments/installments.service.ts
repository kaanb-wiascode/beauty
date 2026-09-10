import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { createInstallmentSchedule, getInstallmentRuntimeStatus } from '../commerce/domain/installment-planner';

interface CreateInstallmentPlanInput {
  installmentCount: number;
  firstDueAt: Date;
  intervalMonths: number;
}

@Injectable()
export class InstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return branchId;
  }

  private async allocatePaymentTx(
    tx: Prisma.TransactionClient,
    saleId: string,
    salePaymentId: string,
    amount: number,
  ): Promise<void> {
    let remainingPayment = Math.round((amount + Number.EPSILON) * 100) / 100;
    if (remainingPayment <= 0) return;

    const plan = await tx.installmentPlan.findUnique({
      where: { saleId },
      include: {
        installments: {
          orderBy: { sequence: 'asc' },
          include: { allocations: { include: { salePayment: true } } },
        },
      },
    });
    if (!plan) return;

    for (const installment of plan.installments) {
      if (remainingPayment <= 0) break;

      const alreadyPaid = installment.allocations
        .filter((allocation) => allocation.salePayment.status === 'COMPLETED')
        .reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      const installmentOutstanding = Math.max(
        0,
        Math.round((Number(installment.amount) - alreadyPaid + Number.EPSILON) * 100) / 100,
      );
      if (installmentOutstanding <= 0) continue;

      const allocatedAmount = Math.min(remainingPayment, installmentOutstanding);
      await tx.installmentAllocation.create({
        data: {
          installmentId: installment.id,
          salePaymentId,
          amount: allocatedAmount,
        },
      });
      remainingPayment = Math.max(
        0,
        Math.round((remainingPayment - allocatedAmount + Number.EPSILON) * 100) / 100,
      );
    }
  }

  async allocatePayment(
    tx: Prisma.TransactionClient,
    saleId: string,
    salePaymentId: string,
    amount: number,
  ): Promise<void> {
    await this.allocatePaymentTx(tx, saleId, salePaymentId, amount);
  }

  async createPlan(saleId: string, input: CreateInstallmentPlanInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, tenantId, branchId },
        select: { id: true, total: true, status: true },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== 'CONFIRMED') {
        throw new BadRequestException('Installment plans can only be created for confirmed sales.');
      }

      const existing = await tx.installmentPlan.findUnique({ where: { saleId } });
      if (existing) throw new BadRequestException('Sale already has an installment plan.');

      const schedule = createInstallmentSchedule(
        Number(sale.total),
        input.installmentCount,
        input.firstDueAt,
        input.intervalMonths,
      );

      await tx.installmentPlan.create({
        data: {
          tenantId,
          branchId,
          saleId,
          installmentCount: input.installmentCount,
          intervalMonths: input.intervalMonths,
          firstDueAt: input.firstDueAt,
          installments: {
            create: schedule.map((installment) => ({
              sequence: installment.sequence,
              amount: installment.amount,
              dueAt: installment.dueAt,
            })),
          },
        },
      });

      const existingPayments = await tx.salePayment.findMany({
        where: { saleId, tenantId, branchId, status: 'COMPLETED' },
        orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      });
      for (const payment of existingPayments) {
        await this.allocatePaymentTx(tx, saleId, payment.id, Number(payment.amount));
      }

      return this.getPlanWithinTx(tx, saleId, tenantId, branchId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async getPlanWithinTx(
    tx: Prisma.TransactionClient,
    saleId: string,
    tenantId: string,
    branchId: string,
  ) {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, tenantId, branchId },
      select: {
        id: true,
        total: true,
        installmentPlan: {
          include: {
            installments: {
              orderBy: { sequence: 'asc' },
              include: { allocations: { include: { salePayment: true } } },
            },
          },
        },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (!sale.installmentPlan) throw new NotFoundException('Installment plan not found');

    const now = new Date();
    const installments = sale.installmentPlan.installments.map((installment) => {
      const paidAmount = Math.round((installment.allocations
        .filter((allocation) => allocation.salePayment.status === 'COMPLETED')
        .reduce((sum, allocation) => sum + Number(allocation.amount), 0) + Number.EPSILON) * 100) / 100;
      const amount = Number(installment.amount);
      const outstanding = Math.max(0, Math.round((amount - paidAmount + Number.EPSILON) * 100) / 100);
      return {
        id: installment.id,
        sequence: installment.sequence,
        amount,
        dueAt: installment.dueAt,
        paidAmount,
        outstanding,
        status: getInstallmentRuntimeStatus(amount, paidAmount, installment.dueAt, now),
      };
    });

    const paid = installments.reduce((sum, installment) => sum + installment.paidAmount, 0);
    const outstanding = installments.reduce((sum, installment) => sum + installment.outstanding, 0);

    return {
      id: sale.installmentPlan.id,
      saleId: sale.id,
      total: Number(sale.total),
      installmentCount: sale.installmentPlan.installmentCount,
      intervalMonths: sale.installmentPlan.intervalMonths,
      firstDueAt: sale.installmentPlan.firstDueAt,
      paid: Math.round((paid + Number.EPSILON) * 100) / 100,
      outstanding: Math.round((outstanding + Number.EPSILON) * 100) / 100,
      overdueCount: installments.filter((installment) => installment.status === 'OVERDUE').length,
      installments,
    };
  }

  async getPlan(saleId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.getPlanWithinTx(this.prisma, saleId, tenantId, branchId);
  }
}
