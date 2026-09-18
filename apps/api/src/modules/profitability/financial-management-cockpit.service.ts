import { Injectable } from '@nestjs/common';
import { CfoDashboardQuery } from './cfo-dashboard.service';
import { ExecutiveFinanceService } from './executive-finance.service';
import { FinancialBenchmarkService } from './financial-benchmark.service';
import { ManagementFinanceActionsService } from './management-finance-actions.service';
import { ManagementFinanceAutomationService } from './management-finance-automation.service';

@Injectable()
export class FinancialManagementCockpitService {
  constructor(
    private readonly executive: ExecutiveFinanceService,
    private readonly benchmark: FinancialBenchmarkService,
    private readonly actions: ManagementFinanceActionsService,
    private readonly automation: ManagementFinanceAutomationService,
  ) {}

  async cockpit(query: CfoDashboardQuery = {}) {
    const [executive, benchmark, anomalies, actionSummary, sla, topActions] = await Promise.all([
      this.executive.executiveSummary(query),
      this.benchmark.branchBenchmark(),
      this.benchmark.anomalies(60),
      this.actions.summary(),
      this.automation.slaSummary(query.asOf ?? new Date()),
      this.actions.list(undefined, 20),
    ]);

    return {
      asOf: executive.asOf,
      health: executive.health,
      covenants: executive.covenants,
      liquidity: executive.liquidity,
      workingCapital: executive.workingCapital,
      branchPortfolio: executive.branchPortfolio,
      benchmark: {
        scoredBranchCount: benchmark.scoredBranchCount,
        averageHealthScore: benchmark.averageHealthScore,
        medianHealthScore: benchmark.medianHealthScore,
        bestScore: benchmark.bestScore,
        worstScore: benchmark.worstScore,
      },
      anomalies: {
        count: anomalies.anomalyCount,
        criticalCount: anomalies.anomalies.filter((item) => item.severity === 'CRITICAL').length,
        items: anomalies.anomalies.slice(0, 10),
      },
      actions: {
        summary: actionSummary,
        sla,
        top: topActions,
      },
      priorities: executive.priorities,
      executiveAlerts: executive.executiveAlerts,
    };
  }
}
