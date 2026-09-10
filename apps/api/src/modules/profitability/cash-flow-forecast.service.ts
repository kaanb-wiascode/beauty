import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type CashFlowScenario = 'BASE' | 'BEST' | 'WORST';

interface ScenarioAssumptions {
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
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i."dueAt" AS due_at,
              GREATEST(i.amount-COALESCE(SUM(CASE WHEN sp.status='COMPLETED' THEN ia.amount ELSE 0 END),0),0)::numeric AS outstanding
       FROM installments i
       JOIN installment_plans ip ON ip.id=i."installmentPlanId"
       JOIN sales s ON s.id=ip."saleId" AND s.status='CONFIRMED'
       JOIN branches b ON b.id=s."branchId"
       LEFT JOIN installment_allocations ia ON ia."installmentId"=i.id
       LEFT JOIN sale_payments sp ON sp.id=ia."salePaymentId"
       WHERE b."companyId"=$1::text
         AND ($2::text IS NULL OR s."branchId"=$2::text)
         AND i."dueAt">=$3::timestamptz AND i."dueAt"<$4::timestamptz
       GROUP BY i.id,i."dueAt",i.amount
       HAVING GREATEST(i.amount-COALESCE(SUM(CASE WHEN sp.status='COMPLETED' THEN ia.amount ELSE 0 END),0),0)>0
       ORDER BY i."dueAt"`,
      companyId,
      branchId,
      from,
      to,
    );
  }

  private async payables(from: Date, to: Date) {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT sb.id,sb.due_at,
              GREATEST(sb.amount-COALESCE(SUM(sbp.amount),0),0)::numeric AS outstanding
       FROM supplier_bills sb
       LEFT JOIN supplier_bill_payments sbp ON sbp.supplier_bill_id=sb.id
       WHERE sb.company_id=$1::text
         AND ($2::text IS NULL OR sb.branch_id=$2::text)
         AND sb.status<>'CANCELLED'
         AND sb.due_at IS NOT NULL
         AND sb.due_at>=$3::timestamptz AND sb.due_at<$4::timestamptz
       GROUP BY sb.id,sb.due_at,sb.amount
       HAVING GREATEST(sb.amount-COALESCE(SUM(sbp.amount),0),0)>0
       ORDER BY sb.due_at`,
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
    const [openingLiquidity, receivables, payables] = await Promise.all([
      this.openingLiquidity(start),
      this.receivables(start, end),
      this.payables(start, end),
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
      const index = Math.floor((dueAt.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (index >= 0 && index < weeks.length) {
        weeks[index].projectedInflows += Number(row.outstanding ?? 0) * assumptions.receivableCollectionRate;
      }
    }

    for (const row of payables) {
      const dueAt = new Date(row.due_at);
      const index = Math.floor((dueAt.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (index >= 0 && index < weeks.length) {
        weeks[index].projectedOutflows += Number(row.outstanding ?? 0) * assumptions.payablePaymentRate;
      }
    }

    let running = openingLiquidity;
    for (const week of weeks) {
      week.projectedInflows = this.round(week.projectedInflows);
      week.projectedOutflows = this.round(week.projectedOutflows);
      week.netCashFlow = this.round(week.projectedInflows - week.projectedOutflows);
      running = this.round(running + week.netCashFlow);
      week.closingLiquidity = running;
    }

    const projectedInflows = this.round(weeks.reduce((sum, week) => sum + week.projectedInflows, 0));
    const projectedOutflows = this.round(weeks.reduce((sum, week) => sum + week.projectedOutflows, 0));
    const lowestLiquidity = weeks.reduce(
      (lowest, week) => Math.min(lowest, week.closingLiquidity),
      openingLiquidity,
    );

    return {
      scenario,
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
