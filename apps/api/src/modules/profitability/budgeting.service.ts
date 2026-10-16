import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
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

  private startOfDay(value: Date) {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: Date) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private daysInclusive(from: Date, to: Date) {
    const start = this.startOfDay(from).getTime();
    const end = this.startOfDay(to).getTime();
    return Math.max(0, Math.floor((end - start) / 86_400_000) + 1);
  }

  private overlap(fromA: Date, toA: Date, fromB: Date, toB: Date) {
    const from = new Date(Math.max(this.startOfDay(fromA).getTime(), this.startOfDay(fromB).getTime()));
    const to = new Date(Math.min(this.startOfDay(toA).getTime(), this.startOfDay(toB).getTime()));
    return to < from ? null : { from, to };
  }

  private proratedBudget(budget: any, from: Date, to: Date) {
    const periodStart = new Date(budget.period_start);
    const periodEnd = new Date(budget.period_end);
    const overlap = this.overlap(periodStart, periodEnd, from, to);
    if (!overlap) return 0;
    const totalDays = this.daysInclusive(periodStart, periodEnd);
    const overlapDays = this.daysInclusive(overlap.from, overlap.to);
    return totalDays > 0 ? this.round(Number(budget.amount ?? 0) * (overlapDays / totalDays)) : 0;
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

  private async targetActual(budget: any, from: Date, to: Date) {
    return budget.target_type === 'BRANCH'
      ? this.branchActual(budget.target_id, budget.metric_type, from, to)
      : this.costCenterActual(budget.target_id, from, to);
  }

  async actualVsBudget(from: Date, to: Date) {
    if (to < from) throw new BadRequestException('Report period end must be on or after period start.');
    const budgets = await this.list(from, to);
    const rows = [] as any[];

    for (const budget of budgets) {
      const overlap = this.overlap(new Date(budget.period_start), new Date(budget.period_end), from, to);
      if (!overlap) continue;
      const budgetAmount = this.proratedBudget(budget, from, to);
      const actual = await this.targetActual(budget, overlap.from, overlap.to);
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
        reportFrom: overlap.from,
        reportTo: overlap.to,
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

  async monthly(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Year must be between 2000 and 2100.');
    }
    const months = [] as any[];
    for (let month = 0; month < 12; month += 1) {
      const from = new Date(Date.UTC(year, month, 1));
      const to = new Date(Date.UTC(year, month + 1, 0));
      const report = await this.actualVsBudget(from, to);
      months.push({
        year,
        month: month + 1,
        from,
        to,
        ...report.summary,
        revenueVariance: this.round(report.summary.revenueActual - report.summary.revenueBudget),
        expenseVariance: this.round(report.summary.expenseBudget - report.summary.expenseActual),
      });
    }
    return { year, months };
  }

  async ytd(year: number, asOfInput?: Date) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Year must be between 2000 and 2100.');
    }
    const start = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const requestedAsOf = asOfInput ?? new Date();
    const asOf = new Date(Math.min(Math.max(this.startOfDay(requestedAsOf).getTime(), start.getTime()), yearEnd.getTime()));
    const report = await this.actualVsBudget(start, asOf);
    return {
      year,
      asOf,
      from: start,
      to: asOf,
      ...report.summary,
      revenueVariance: this.round(report.summary.revenueActual - report.summary.revenueBudget),
      expenseVariance: this.round(report.summary.expenseBudget - report.summary.expenseActual),
      rows: report.rows,
    };
  }

  async forecast(from: Date, to: Date, asOfInput?: Date) {
    if (to < from) throw new BadRequestException('Forecast period end must be on or after period start.');
    const periodStart = this.startOfDay(from);
    const periodEnd = this.startOfDay(to);
    const requestedAsOf = this.startOfDay(asOfInput ?? new Date());
    const asOf = new Date(Math.min(Math.max(requestedAsOf.getTime(), periodStart.getTime()), periodEnd.getTime()));
    const elapsedDays = this.daysInclusive(periodStart, asOf);
    const totalDays = this.daysInclusive(periodStart, periodEnd);
    const progressPercent = totalDays > 0 ? this.round((elapsedDays / totalDays) * 100) : 0;
    const budgets = await this.list(periodStart, periodEnd);
    const rows = [] as any[];

    for (const budget of budgets) {
      const fullOverlap = this.overlap(new Date(budget.period_start), new Date(budget.period_end), periodStart, periodEnd);
      if (!fullOverlap) continue;
      const elapsedOverlap = this.overlap(fullOverlap.from, fullOverlap.to, periodStart, asOf);
      const budgetAmount = this.proratedBudget(budget, fullOverlap.from, fullOverlap.to);
      const actualToDate = elapsedOverlap
        ? await this.targetActual(budget, elapsedOverlap.from, elapsedOverlap.to)
        : 0;
      const elapsedTargetDays = elapsedOverlap ? this.daysInclusive(elapsedOverlap.from, elapsedOverlap.to) : 0;
      const fullTargetDays = this.daysInclusive(fullOverlap.from, fullOverlap.to);
      const runRatePerDay = elapsedTargetDays > 0 ? actualToDate / elapsedTargetDays : 0;
      const forecastAtCompletion = this.round(runRatePerDay * fullTargetDays);
      const forecastVariance = budget.metric_type === 'REVENUE'
        ? this.round(forecastAtCompletion - budgetAmount)
        : this.round(budgetAmount - forecastAtCompletion);

      rows.push({
        budgetId: budget.id,
        targetType: budget.target_type,
        targetId: budget.target_id,
        targetName: budget.targetName,
        metricType: budget.metric_type,
        budget: budgetAmount,
        actualToDate,
        runRatePerDay: this.round(runRatePerDay),
        forecastAtCompletion,
        forecastVariance,
        forecastVariancePercent: budgetAmount > 0 ? this.round((forecastVariance / budgetAmount) * 100) : 0,
        favorable: forecastVariance >= 0,
      });
    }

    return {
      from: periodStart,
      to: periodEnd,
      asOf,
      elapsedDays,
      totalDays,
      progressPercent,
      rows,
      summary: {
        revenueBudget: this.round(rows.filter((r) => r.metricType === 'REVENUE').reduce((s, r) => s + r.budget, 0)),
        revenueActualToDate: this.round(rows.filter((r) => r.metricType === 'REVENUE').reduce((s, r) => s + r.actualToDate, 0)),
        revenueForecast: this.round(rows.filter((r) => r.metricType === 'REVENUE').reduce((s, r) => s + r.forecastAtCompletion, 0)),
        expenseBudget: this.round(rows.filter((r) => r.metricType === 'EXPENSE').reduce((s, r) => s + r.budget, 0)),
        expenseActualToDate: this.round(rows.filter((r) => r.metricType === 'EXPENSE').reduce((s, r) => s + r.actualToDate, 0)),
        expenseForecast: this.round(rows.filter((r) => r.metricType === 'EXPENSE').reduce((s, r) => s + r.forecastAtCompletion, 0)),
      },
    };
  }
}
