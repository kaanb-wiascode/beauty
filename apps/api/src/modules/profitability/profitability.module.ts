import { Module } from '@nestjs/common';
import { ProfitabilityController } from './profitability.controller';
import { FinancialHealthHistoryController } from './financial-health-history.controller';
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

@Module({
  controllers: [ProfitabilityController, FinancialHealthHistoryController],
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
  ],
})
export class ProfitabilityModule {}
