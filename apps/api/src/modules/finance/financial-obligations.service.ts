import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class FinancialObligationsService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private ctx() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async create(input: any, actorId: string) {
    const ctx = this.ctx();
    if (Boolean(input.sourceType) !== Boolean(input.sourceId)) {
      throw new BadRequestException('sourceType and sourceId must be provided together.');
    }
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO financial_obligations(
        id,tenant_id,company_id,branch_id,obligation_type,title,counterparty,amount,currency,due_date,
        priority,cost_center_id,category_id,description,source_type,source_id,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9,$10::date,$11::"FinancialObligationPriority",$12,$13,$14,$15,$16,$17)`,
      id,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId ?? input.branchId ?? null,
      input.obligationType,
      input.title,
      input.counterparty ?? null,
      input.amount,
      (input.currency ?? 'TRY').toUpperCase(),
      input.dueDate,
      input.priority ?? 'NORMAL',
      input.costCenterId ?? null,
      input.categoryId ?? null,
      input.description ?? null,
      input.sourceType ?? null,
      input.sourceId ?? null,
      actorId,
    );
    return this.get(id);
  }

  async list(status?: string, limit = 100) {
    const ctx = this.ctx();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,branch_id AS "branchId",rule_id AS "ruleId",period_key AS "periodKey",
              obligation_type AS "obligationType",title,counterparty,amount,currency,due_date AS "dueDate",
              status,priority,cost_center_id AS "costCenterId",category_id AS "categoryId",description,
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM financial_obligations
       WHERE tenant_id=$1 AND company_id=$2
         AND ($3::text IS NULL OR branch_id=$3)
         AND ($4::text IS NULL OR status=$4::"FinancialObligationStatus")
       ORDER BY due_date ASC,created_at ASC LIMIT $5`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      status ?? null,
      Math.min(Math.max(limit, 1), 500),
    );
  }

  async get(id: string) {
    const ctx = this.ctx();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,branch_id AS "branchId",rule_id AS "ruleId",period_key AS "periodKey",
              obligation_type AS "obligationType",title,counterparty,amount,currency,due_date AS "dueDate",
              status,priority,cost_center_id AS "costCenterId",category_id AS "categoryId",description,
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM financial_obligations
       WHERE id=$1 AND tenant_id=$2 AND company_id=$3
         AND ($4::text IS NULL OR branch_id=$4) LIMIT 1`,
      id,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    if (!rows.length) throw new NotFoundException('Financial obligation not found.');
    return rows[0];
  }

  async transition(id: string, next: string) {
    const ctx = this.ctx();
    const allowed: Record<string, string[]> = {
      DRAFT: ['SCHEDULED', 'CANCELLED'],
      SCHEDULED: ['DUE', 'APPROVAL_PENDING', 'CANCELLED'],
      DUE: ['APPROVAL_PENDING', 'APPROVED', 'OVERDUE', 'CANCELLED'],
      OVERDUE: ['APPROVAL_PENDING', 'APPROVED', 'CANCELLED'],
      APPROVAL_PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['READY_FOR_PAYMENT', 'CANCELLED'],
      READY_FOR_PAYMENT: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
      PARTIALLY_PAID: ['PAID'],
      PAID: ['RECONCILED'],
      RECONCILED: ['POSTED'],
      REJECTED: ['DRAFT', 'CANCELLED'],
      POSTED: [], CANCELLED: [],
    };
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM financial_obligations
         WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND ($4::text IS NULL OR branch_id=$4)
         FOR UPDATE`,
        id, ctx.tenantId, ctx.companyId, ctx.branchId,
      );
      if (!rows.length) throw new NotFoundException('Financial obligation not found.');
      const current = rows[0].status;
      if (!(allowed[current] ?? []).includes(next)) {
        throw new BadRequestException(`Invalid obligation transition: ${current} -> ${next}`);
      }
      await tx.$executeRawUnsafe(
        `UPDATE financial_obligations SET status=$2::"FinancialObligationStatus",updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        id, next,
      );
      const result = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,status,due_date AS "dueDate",amount,currency FROM financial_obligations WHERE id=$1`, id,
      );
      return result[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async refreshDueStatuses() {
    const ctx = this.ctx();
    return this.prisma.$transaction(async (tx) => {
      const overdue = await tx.$executeRawUnsafe(
        `UPDATE financial_obligations
         SET status='OVERDUE'::"FinancialObligationStatus",updated_at=CURRENT_TIMESTAMP
         WHERE tenant_id=$1 AND company_id=$2 AND ($3::text IS NULL OR branch_id=$3)
           AND due_date<CURRENT_DATE
           AND status IN ('SCHEDULED','DUE')`,
        ctx.tenantId, ctx.companyId, ctx.branchId,
      );
      const due = await tx.$executeRawUnsafe(
        `UPDATE financial_obligations
         SET status='DUE'::"FinancialObligationStatus",updated_at=CURRENT_TIMESTAMP
         WHERE tenant_id=$1 AND company_id=$2 AND ($3::text IS NULL OR branch_id=$3)
           AND due_date=CURRENT_DATE
           AND status='SCHEDULED'`,
        ctx.tenantId, ctx.companyId, ctx.branchId,
      );
      return { due, overdue, updated: due + overdue };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async calendarEntries(from: Date, to: Date, limit = 250) {
    if (to < from) throw new BadRequestException('Calendar end date must be on or after start date.');
    const ctx = this.ctx();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,branch_id AS "branchId",rule_id AS "ruleId",obligation_type AS "obligationType",
              title,counterparty,amount,currency,due_date AS "dueDate",status,priority,
              cost_center_id AS "costCenterId",category_id AS "categoryId",
              CASE
                WHEN due_date<CURRENT_DATE AND status NOT IN ('PAID','RECONCILED','POSTED','CANCELLED') THEN 'OVERDUE'
                WHEN due_date=CURRENT_DATE AND status NOT IN ('PAID','RECONCILED','POSTED','CANCELLED') THEN 'TODAY'
                ELSE 'UPCOMING'
              END AS "calendarBucket"
       FROM financial_obligations
       WHERE tenant_id=$1 AND company_id=$2 AND ($3::text IS NULL OR branch_id=$3)
         AND due_date BETWEEN $4::date AND $5::date
         AND status<>'CANCELLED'
       ORDER BY due_date ASC,
                CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
                created_at ASC
       LIMIT $6`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      from,
      to,
      Math.min(Math.max(limit, 1), 500),
    );
  }

  async calendar() {
    const ctx = this.ctx();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
        COUNT(*) FILTER (WHERE due_date=CURRENT_DATE AND status NOT IN ('PAID','RECONCILED','POSTED','CANCELLED'))::int AS "dueToday",
        COUNT(*) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+6 AND status NOT IN ('PAID','RECONCILED','POSTED','CANCELLED'))::int AS "dueThisWeek",
        COUNT(*) FILTER (WHERE date_trunc('month',due_date)=date_trunc('month',CURRENT_DATE) AND status NOT IN ('PAID','RECONCILED','POSTED','CANCELLED'))::int AS "dueThisMonth",
        COUNT(*) FILTER (WHERE due_date<CURRENT_DATE AND status NOT IN ('PAID','RECONCILED','POSTED','CANCELLED'))::int AS overdue,
        COUNT(*) FILTER (WHERE status='READY_FOR_PAYMENT')::int AS "readyForPayment",
        COUNT(*) FILTER (WHERE status='APPROVAL_PENDING')::int AS "waitingApproval",
        COALESCE(SUM(amount) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30 AND status NOT IN ('PAID','RECONCILED','POSTED','CANCELLED')),0)::numeric AS "outgoing30d"
       FROM financial_obligations
       WHERE tenant_id=$1 AND company_id=$2 AND ($3::text IS NULL OR branch_id=$3)`,
      ctx.tenantId, ctx.companyId, ctx.branchId,
    );
    return rows[0];
  }
}
