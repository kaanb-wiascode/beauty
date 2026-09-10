import { Module } from '@nestjs/common';
import { ProfitabilityController } from './profitability.controller';
import { ProfitabilityService } from './profitability.service';
import { NetProfitabilityService } from './net-profitability.service';
import { ProfitabilityConfigService } from './profitability-config.service';
import { CostCenterService } from './cost-center.service';
import { BudgetingService } from './budgeting.service';
import { CashFlowForecastService } from './cash-flow-forecast.service';
import { TreasuryRiskService } from './treasury-risk.service';

@Module({
  controllers: [ProfitabilityController],
  providers: [
    ProfitabilityService,
    NetProfitabilityService,
    ProfitabilityConfigService,
    CostCenterService,
    BudgetingService,
    CashFlowForecastService,
    TreasuryRiskService,
  ],
  exports: [
    ProfitabilityService,
    NetProfitabilityService,
    ProfitabilityConfigService,
    CostCenterService,
    BudgetingService,
    CashFlowForecastService,
    TreasuryRiskService,
  ],
})
export class ProfitabilityModule {}
