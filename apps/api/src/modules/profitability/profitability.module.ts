import { Module } from '@nestjs/common';
import { ProfitabilityController } from './profitability.controller';
import { FinancialHealthHistoryController } from './financial-health-history.controller';
import { ExecutiveFinanceController } from './executive-finance.controller';
import { FinancialGovernanceController } from './financial-governance.controller';
import { ProfitabilityService } from './profitability.service';
import { NetProfitabilityService } from './net-profitability.service';
import { ProfitabilityConfigService } from './profitability-config.service';
import { CostCenterService } from './cost-center.service';
import { BudgetingService } from './budgeting.service';
import { CashFlowForecastService } from './cash-flow-forecast.service';
import { TreasuryRiskService } from './treasury-risk.service';
import { CfoDashboardService } from './cfo-dashboard.service';
import { FinancialHealthService } from './financial-health.service';
import { FinancialHealthHistoryService } from './financial-health-history.service';
import { FinancialHealthSchedulerService } from './financial-health-scheduler.service';
import { ExecutiveFinanceService } from './executive-finance.service';
import { FinancialBenchmarkService } from './financial-benchmark.service';
import { ManagementFinanceActionsService } from './management-finance-actions.service';
import { ManagementFinanceAutomationService } from './management-finance-automation.service';
import { ManagementFinanceAutomationSchedulerService } from './management-finance-automation-scheduler.service';
import { FinancialManagementCockpitService } from './financial-management-cockpit.service';

@Module({
  controllers: [
    ProfitabilityController,
    FinancialHealthHistoryController,
    ExecutiveFinanceController,
    FinancialGovernanceController,
  ],
  providers: [
    ProfitabilityService,
    NetProfitabilityService,
    ProfitabilityConfigService,
    CostCenterService,
    BudgetingService,
    CashFlowForecastService,
    TreasuryRiskService,
    CfoDashboardService,
    FinancialHealthService,
    FinancialHealthHistoryService,
    FinancialHealthSchedulerService,
    ExecutiveFinanceService,
    FinancialBenchmarkService,
    ManagementFinanceActionsService,
    ManagementFinanceAutomationService,
    ManagementFinanceAutomationSchedulerService,
    FinancialManagementCockpitService,
  ],
  exports: [
    ProfitabilityService,
    NetProfitabilityService,
    ProfitabilityConfigService,
    CostCenterService,
    BudgetingService,
    CashFlowForecastService,
    TreasuryRiskService,
    CfoDashboardService,
    FinancialHealthService,
    FinancialHealthHistoryService,
    FinancialHealthSchedulerService,
    ExecutiveFinanceService,
    FinancialBenchmarkService,
    ManagementFinanceActionsService,
    ManagementFinanceAutomationService,
    FinancialManagementCockpitService,
  ],
})
export class ProfitabilityModule {}
