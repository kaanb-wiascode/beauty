import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type CashFlowScenario = 'BASE' | 'BEST' | 'WORST';

export interface ScenarioAssumptions {
  receivableCollectionRate: number;
  payablePaymentRate: number;
  label: string;
}

@Injectable()
export class CashFlowForecastService {
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
    const result = new Date(value);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private addDays(value: Date, days: number) {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private assumptions(scenario: CashFlowScenario): ScenarioAssumptions {
    if (scenario === 'BEST') {
      return {
        label: 'Best case',
        receivableCollectionRate: 1,
        payablePaymentRate: 0.9,
      };
    }
    if (scenario === 'WORST') {
      return {
        label: 'Worst case',
        receivableCollectionRate: 0.7,
        payablePaymentRate: 1,
      };
    }
    return {
      label: 'Base case',
      receivableCollectionRate: 0.9,
      payablePaymentRate: 1,
    };
  }

  private async openingLiquidity(asOf: Date) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS amount
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
       JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code IN ('100','102','108')
       WHERE je."companyId"=$1::text
         AND ($2::text IS NULL OR je."branchId"=$2::text)
         AND je."entryDate"<$3::timestamptz`,
      companyId,
      branchId,
      asOf,
    );
    return this.round(Number(rows[0]?.amount ?? 0));
  }

  private async receivables(from: Date, to: Date) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.due_date AS due_at,
              GREATEST(
                i.gross_amount-COALESCE((
                  SELECT SUM(c.amount)
                  FROM income_collections c
                  LEFT JOIN income_collection_reversals r ON r.income_collection_id=c.id
                  WHERE c.income_record_id=i.id AND r.id IS NULL
                ),0),
                0
              )*i.exchange_rate AS outstanding
       FROM income_records i
       WHERE i.tenant_id=$1::text AND i.company_id=$2::text
         AND ($3::text IS NULL OR i.branch_id=$3::text)
         AND i.approval_status='APPROVED'
         AND i.due_date IS NOT NULL
         AND i.due_date>=$4::timestamptz AND i.due_date<$5::timestamptz
         AND GREATEST(
           i.gross_amount-COALESCE((
             SELECT SUM(c.amount)
             FROM income_collections c
             LEFT JOIN income_collection_reversals r ON r.income_collection_id=c.id
             WHERE c.income_record_id=i.id AND r.id IS NULL
           ),0),
           0
         )>0.01
       ORDER BY i.due_date`,
      tenantId,
      companyId,
      branchId,
      from,
      to,
    );
  }

  private async payables(from: Date, to: Date) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT e.id,e.due_date AS due_at,
              GREATEST(
                (e.gross_amount-e.withholding_amount)-COALESCE((
                  SELECT SUM(p.amount)
                  FROM expense_payments p
                  LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
                  WHERE p.expense_id=e.id AND r.id IS NULL
                ),0),
                0
              )*e.exchange_rate AS outstanding
       FROM expenses e
       WHERE e.tenant_id=$1::text AND e.company_id=$2::text
         AND ($3::text IS NULL OR e.branch_id=$3::text)
         AND e.approval_status='APPROVED'
         AND e.due_date IS NOT NULL
         AND e.due_date>=$4::timestamptz AND e.due_date<$5::timestamptz
         AND GREATEST(
           (e.gross_amount-e.withholding_amount)-COALESCE((
             SELECT SUM(p.amount)
             FROM expense_payments p
             LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
             WHERE p.expense_id=e.id AND r.id IS NULL
           ),0),
           0
         )>0.01
       ORDER BY e.due_date`,
      tenantId,
      companyId,
      branchId,
      from,
      to,
    );
  }

  async thirteenWeek(startInput: Date, scenario: CashFlowScenario = 'BASE') {
    if (!['BASE', 'BEST', 'WORST'].includes(scenario)) {
      throw new BadRequestException('Scenario must be BASE, BEST or WORST.');
    }

    const start = this.startOfDay(startInput);
    const end = this.addDays(start, 13 * 7);
    const assumptions = this.assumptions(scenario);
    const { tenantId, companyId } = this.context();
    const [openingLiquidity, receivables, payables, company] = await Promise.all([
      this.openingLiquidity(start),
      this.receivables(start, end),
      this.payables(start, end),
      this.prisma.company.findFirst({
        where: { id: companyId, tenantId },
        select: { baseCurrency: true },
      }),
    ]);

    const weeks = Array.from({ length: 13 }, (_, index) => {
      const weekStart = this.addDays(start, index * 7);
      const weekEnd = this.addDays(weekStart, 7);
      return {
        week: index + 1,
        start: weekStart,
        end: this.addDays(weekEnd, -1),
        projectedInflows: 0,
        projectedOutflows: 0,
        netCashFlow: 0,
        closingLiquidity: 0,
      };
    });

    for (const row of receivables) {
      const dueAt = new Date(row.due_at);
      const index = Math.floor(
        (dueAt.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000),
      );
      if (index >= 0 && index < weeks.length) {
        weeks[index].projectedInflows +=
          Number(row.outstanding ?? 0) * assumptions.receivableCollectionRate;
      }
    }

    for (const row of payables) {
      const dueAt = new Date(row.due_at);
      const index = Math.floor(
        (dueAt.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000),
      );
      if (index >= 0 && index < weeks.length) {
        weeks[index].projectedOutflows +=
          Number(row.outstanding ?? 0) * assumptions.payablePaymentRate;
      }
    }

    let running = openingLiquidity;
    for (const week of weeks) {
      week.projectedInflows = this.round(week.projectedInflows);
      week.projectedOutflows = this.round(week.projectedOutflows);
      week.netCashFlow = this.round(
        week.projectedInflows - week.projectedOutflows,
      );
      running = this.round(running + week.netCashFlow);
      week.closingLiquidity = running;
    }

    const projectedInflows = this.round(
      weeks.reduce((sum, week) => sum + week.projectedInflows, 0),
    );
    const projectedOutflows = this.round(
      weeks.reduce((sum, week) => sum + week.projectedOutflows, 0),
    );
    const lowestLiquidity = weeks.reduce(
      (lowest, week) => Math.min(lowest, week.closingLiquidity),
      openingLiquidity,
    );

    return {
      scenario,
      baseCurrency: company?.baseCurrency ?? 'TRY',
      assumptions,
      start,
      end: this.addDays(end, -1),
      openingLiquidity,
      projectedInflows,
      projectedOutflows,
      projectedNetCashFlow: this.round(projectedInflows - projectedOutflows),
      forecastClosingLiquidity: running,
      lowestLiquidity: this.round(lowestLiquidity),
      liquidityRisk: lowestLiquidity < 0,
      weeks,
    };
  }

  async scenarioComparison(startInput: Date) {
    const [base, best, worst] = await Promise.all([
      this.thirteenWeek(startInput, 'BASE'),
      this.thirteenWeek(startInput, 'BEST'),
      this.thirteenWeek(startInput, 'WORST'),
    ]);
    return {
      start: this.startOfDay(startInput),
      horizonWeeks: 13,
      baseCurrency: base.baseCurrency,
      scenarios: [base, best, worst].map((item) => ({
        scenario: item.scenario,
        assumptions: item.assumptions,
        openingLiquidity: item.openingLiquidity,
        projectedInflows: item.projectedInflows,
        projectedOutflows: item.projectedOutflows,
        projectedNetCashFlow: item.projectedNetCashFlow,
        forecastClosingLiquidity: item.forecastClosingLiquidity,
        lowestLiquidity: item.lowestLiquidity,
        liquidityRisk: item.liquidityRisk,
      })),
    };
  }
}
