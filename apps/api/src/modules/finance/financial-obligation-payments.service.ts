import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class FinancialObligationPaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private ctx() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async list(obligationId: string) {
    const ctx = this.ctx();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.expense_payment_id AS "expensePaymentId",a.amount,a.allocated_by AS "allocatedBy",
              a.allocated_at AS "allocatedAt",a.reversed_by AS "reversedBy",a.reversed_at AS "reversedAt",
              a.reversal_reason AS "reversalReason"
       FROM financial_obligation_payment_allocations a
       JOIN financial_obligations o ON o.id=a.obligation_id
       WHERE a.obligation_id=$1 AND a.tenant_id=$2 AND a.company_id=$3
         AND ($4::text IS NULL OR a.branch_id=$4)
         AND o.tenant_id=$2 AND o.company_id=$3
       ORDER BY a.allocated_at ASC`,
      obligationId,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
  }

  async allocate(obligationId: string, expensePaymentId: string, amount: number | undefined, actorId: string) {
    const ctx = this.ctx();
    return this.prisma.$transaction(async (tx) => {
      const obligations = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,amount,currency,status,branch_id AS "branchId"
         FROM financial_obligations
         WHERE id=$1 AND tenant_id=$2 AND company_id=$3
           AND ($4::text IS NULL OR branch_id=$4)
         FOR UPDATE`,
        obligationId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!obligations.length) throw new NotFoundException('Financial obligation not found.');
      const obligation = obligations[0];
      if (!['APPROVED', 'READY_FOR_PAYMENT', 'PARTIALLY_PAID', 'PAID'].includes(obligation.status)) {
        throw new BadRequestException('Financial obligation is not eligible for payment allocation.');
      }

      const payments = await tx.$queryRawUnsafe<any[]>(
        `SELECT ep.id,ep.amount,e.currency
         FROM expense_payments ep
         JOIN expenses e ON e.id=ep.expense_id
         LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=ep.id
         WHERE ep.id=$1 AND ep.tenant_id=$2 AND ep.company_id=$3
           AND ($4::text IS NULL OR ep.branch_id=$4)
           AND r.id IS NULL
         FOR UPDATE OF ep`,
        expensePaymentId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!payments.length) throw new NotFoundException('Active expense payment not found.');
      const payment = payments[0];
      if (payment.currency !== obligation.currency) {
        throw new BadRequestException('Obligation and expense payment currencies do not match.');
      }

      const obligationAllocatedRows = await tx.$queryRawUnsafe<Array<{ total: number }>>(
        `SELECT COALESCE(SUM(amount),0)::numeric AS total
         FROM financial_obligation_payment_allocations
         WHERE obligation_id=$1 AND reversed_at IS NULL`,
        obligationId,
      );
      const paymentAllocatedRows = await tx.$queryRawUnsafe<Array<{ total: number }>>(
        `SELECT COALESCE(SUM(amount),0)::numeric AS total
         FROM financial_obligation_payment_allocations
         WHERE expense_payment_id=$1 AND reversed_at IS NULL`,
        expensePaymentId,
      );

      const obligationRemaining = Number(obligation.amount) - Number(obligationAllocatedRows[0]?.total ?? 0);
      const paymentRemaining = Number(payment.amount) - Number(paymentAllocatedRows[0]?.total ?? 0);
      const allocationAmount = amount ?? Math.min(obligationRemaining, paymentRemaining);
      if (!Number.isFinite(allocationAmount) || allocationAmount <= 0) {
        throw new BadRequestException('Allocation amount must be greater than zero.');
      }
      if (allocationAmount - obligationRemaining > 0.005) {
        throw new BadRequestException('Allocation exceeds remaining obligation amount.');
      }
      if (allocationAmount - paymentRemaining > 0.005) {
        throw new BadRequestException('Allocation exceeds remaining expense payment amount.');
      }

      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO financial_obligation_payment_allocations(
           id,tenant_id,company_id,branch_id,obligation_id,expense_payment_id,amount,allocated_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7::numeric,$8)`,
        id,
        ctx.tenantId,
        ctx.companyId,
        obligation.branchId,
        obligationId,
        expensePaymentId,
        allocationAmount,
        actorId,
      );

      await this.recalculate(tx, obligationId, ctx.tenantId, ctx.companyId);
      return this.getWith(tx, id, ctx.tenantId, ctx.companyId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reverse(allocationId: string, actorId: string, reason: string) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new BadRequestException('Allocation reversal reason is required.');
    const ctx = this.ctx();

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,obligation_id AS "obligationId",reversed_at AS "reversedAt"
         FROM financial_obligation_payment_allocations
         WHERE id=$1 AND tenant_id=$2 AND company_id=$3
           AND ($4::text IS NULL OR branch_id=$4)
         FOR UPDATE`,
        allocationId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!rows.length) throw new NotFoundException('Financial obligation payment allocation not found.');
      if (rows[0].reversedAt) throw new BadRequestException('Financial obligation payment allocation is already reversed.');

      await tx.$executeRawUnsafe(
        `UPDATE financial_obligation_payment_allocations
         SET reversed_by=$2,reversed_at=CURRENT_TIMESTAMP,reversal_reason=$3
         WHERE id=$1`,
        allocationId,
        actorId,
        normalizedReason,
      );
      await this.recalculate(tx, rows[0].obligationId, ctx.tenantId, ctx.companyId);
      return this.getWith(tx, allocationId, ctx.tenantId, ctx.companyId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async recalculate(tx: Prisma.TransactionClient, obligationId: string, tenantId: string, companyId: string) {
    const rows = await tx.$queryRawUnsafe<Array<{ amount: number; allocated: number }>>(
      `SELECT o.amount,
              COALESCE(SUM(a.amount) FILTER (WHERE a.reversed_at IS NULL),0)::numeric AS allocated
       FROM financial_obligations o
       LEFT JOIN financial_obligation_payment_allocations a ON a.obligation_id=o.id
       WHERE o.id=$1 AND o.tenant_id=$2 AND o.company_id=$3
       GROUP BY o.id,o.amount`,
      obligationId,
      tenantId,
      companyId,
    );
    if (!rows.length) throw new NotFoundException('Financial obligation not found.');
    const amount = Number(rows[0].amount);
    const allocated = Number(rows[0].allocated);
    const status = allocated <= 0.005 ? 'READY_FOR_PAYMENT' : allocated + 0.005 >= amount ? 'PAID' : 'PARTIALLY_PAID';
    await tx.$executeRawUnsafe(
      `UPDATE financial_obligations
       SET status=$2::"FinancialObligationStatus",updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      obligationId,
      status,
    );
  }

  private async getWith(client: Prisma.TransactionClient | PrismaService, id: string, tenantId: string, companyId: string) {
    const rows = await client.$queryRawUnsafe<any[]>(
      `SELECT id,obligation_id AS "obligationId",expense_payment_id AS "expensePaymentId",amount,
              allocated_by AS "allocatedBy",allocated_at AS "allocatedAt",reversed_by AS "reversedBy",
              reversed_at AS "reversedAt",reversal_reason AS "reversalReason"
       FROM financial_obligation_payment_allocations
       WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,
      id,
      tenantId,
      companyId,
    );
    return rows[0];
  }
}
