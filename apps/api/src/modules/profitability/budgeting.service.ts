import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type BudgetTargetType = 'BRANCH' | 'COST_CENTER';
type BudgetMetricType = 'REVENUE' | 'EXPENSE';

interface UpsertBudgetInput {
  targetType: BudgetTargetType;
  targetId: string;
  metricType: BudgetMetricType;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  note?: string;
}

@Injectable()
export class BudgetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async upsert(input: UpsertBudgetInput) {
    const { tenantId, companyId } = this.context();
    if (input.periodEnd < input.periodStart) {
      throw new BadRequestException('Budget period end must be on or after period start.');
    }
    if (input.targetType === 'COST_CENTER' && input.metricType !== 'EXPENSE') {
      throw new BadRequestException('Cost center budgets support EXPENSE metric only in v1.');
    }
    const amount = this.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Budget amount must be zero or greater.');
    }

    const id = randomUUID();
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO budgets(
           id,tenant_id,company_id,target_type,target_id,metric_type,period_start,period_end,amount,note,created_at,updated_at
         ) VALUES($1::text,$2::text,$3::text,$4::"BudgetTargetType",$5::text,$6::"BudgetMetricType",$7::date,$8::date,$9,$10,NOW(),NOW())
         ON CONFLICT(company_id,target_type,target_id,metric_type,period_start,period_end)
         DO UPDATE SET amount=EXCLUDED.amount,note=EXCLUDED.note,updated_at=NOW()
         RETURNING *`,
        id,
        tenantId,
        companyId,
        input.targetType,
        input.targetId,
        input.metricType,
        input.periodStart,
        input.periodEnd,
        amount,
        input.note?.trim() || null,
      );
      return rows[0];
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
        throw new BadRequestException('Budget target is invalid for this company.');
      }
      throw error;
    }
  }

  async list(from?: Date, to?: Date) {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT b.*,
              CASE WHEN b.target_type='BRANCH' THEN br.name ELSE cc.name END AS "targetName"
       FROM budgets b
       LEFT JOIN branches br ON b.target_type='BRANCH' AND br.id=b.target_id
       LEFT JOIN cost_centers cc ON b.target_type='COST_CENTER' AND cc.id=b.target_id
       WHERE b.company_id=$1::text
         AND ($2::text IS NULL OR b.target_type<>'BRANCH' OR b.target_id=$2::text)
         AND ($3::date IS NULL OR b.period_end >= $3::date)
         AND ($4::date IS NULL OR b.period_start <= $4::date)
       ORDER BY b.period_start DESC,b.target_type,b.target_id,b.metric_type`,
      companyId,
      branchId,
      from ?? null,
      to ?? null,
    );
  }

  private async branchActual(branchId: string, metric: BudgetMetricType, from: Date, to: Date) {
    const { companyId } = this.context();
    if (metric === 'REVENUE') {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `WITH refunds AS (
           SELECT sp."saleId",COALESCE(SUM(sp.amount),0)::numeric AS refunded
           FROM sale_payments sp WHERE sp.status='REFUNDED' GROUP BY sp."saleId"
         )
         SELECT COALESCE(SUM(GREATEST(s.total-COALESCE(r.refunded,0),0)),0)::numeric AS amount
         FROM sales s
         JOIN branches b ON b.id=s."branchId"
         LEFT JOIN refunds r ON r."saleId"=s.id
         WHERE b."companyId"=$1::text AND s."branchId"=$2::text AND s.status='CONFIRMED'
           AND s."confirmedAt">=$3::timestamptz AND s."confirmedAt"<($4::date + INTERVAL '1 day')`,
        companyId,
        branchId,
        from,
        to,
      );
      return this.round(Number(rows[0]?.amount ?? 0));
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH direct_expense AS (
         SELECT COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS amount
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.type='EXPENSE' AND coa.code<>'740'
         WHERE je."companyId"=$1::text AND je."branchId"=$2::text
           AND je."entryDate">=$3::timestamptz AND je."entryDate"<($4::date + INTERVAL '1 day')
       ), allocated AS (
         SELECT COALESCE(SUM((jel.debit-jel.credit)*(cba.percent/100.0)),0)::numeric AS amount
         FROM cost_center_expense_links ccel
         JOIN cost_centers cc ON cc.id=ccel.cost_center_id AND cc.company_id=$1::text AND cc.active=true
         JOIN cost_center_branch_allocations cba ON cba.cost_center_id=cc.id AND cba.branch_id=$2::text
         JOIN journal_entry_lines jel ON jel.id=ccel.journal_entry_line_id
         JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED' AND je."branchId" IS NULL
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.type='EXPENSE' AND coa.code<>'740'
         WHERE je."entryDate">=$3::timestamptz AND je."entryDate"<($4::date + INTERVAL '1 day')
       )
       SELECT COALESCE(d.amount,0)+COALESCE(a.amount,0) AS amount FROM direct_expense d CROSS JOIN allocated a`,
      companyId,
      branchId,
      from,
      to,
    );
    return this.round(Number(rows[0]?.amount ?? 0));
  }

  private async costCenterActual(costCenterId: string, from: Date, to: Date) {
    const { companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS amount
       FROM cost_center_expense_links ccel
       JOIN cost_centers cc ON cc.id=ccel.cost_center_id AND cc.company_id=$1::text
       JOIN journal_entry_lines jel ON jel.id=ccel.journal_entry_line_id
       JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
       JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.type='EXPENSE'
       WHERE ccel.cost_center_id=$2::text
         AND je."entryDate">=$3::timestamptz AND je."entryDate"<($4::date + INTERVAL '1 day')`,
      companyId,
      costCenterId,
      from,
      to,
    );
    return this.round(Number(rows[0]?.amount ?? 0));
  }

  async actualVsBudget(from: Date, to: Date) {
    if (to < from) throw new BadRequestException('Report period end must be on or after period start.');
    const budgets = await this.list(from, to);
    const rows = [] as any[];

    for (const budget of budgets) {
      const budgetAmount = this.round(Number(budget.amount ?? 0));
      const actual = budget.target_type === 'BRANCH'
        ? await this.branchActual(budget.target_id, budget.metric_type, from, to)
        : await this.costCenterActual(budget.target_id, from, to);
      const variance = budget.metric_type === 'REVENUE'
        ? this.round(actual - budgetAmount)
        : this.round(budgetAmount - actual);
      const variancePercent = budgetAmount > 0 ? this.round((variance / budgetAmount) * 100) : 0;

      rows.push({
        budgetId: budget.id,
        targetType: budget.target_type,
        targetId: budget.target_id,
        targetName: budget.targetName,
        metricType: budget.metric_type,
        periodStart: budget.period_start,
        periodEnd: budget.period_end,
        budget: budgetAmount,
        actual,
        variance,
        variancePercent,
        favorable: variance >= 0,
      });
    }

    return {
      from,
      to,
      rows,
      summary: {
        revenueBudget: this.round(rows.filter((r) => r.metricType === 'REVENUE').reduce((s, r) => s + r.budget, 0)),
        revenueActual: this.round(rows.filter((r) => r.metricType === 'REVENUE').reduce((s, r) => s + r.actual, 0)),
        expenseBudget: this.round(rows.filter((r) => r.metricType === 'EXPENSE').reduce((s, r) => s + r.budget, 0)),
        expenseActual: this.round(rows.filter((r) => r.metricType === 'EXPENSE').reduce((s, r) => s + r.actual, 0)),
      },
    };
  }
}
