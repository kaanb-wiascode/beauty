import { Module } from '@nestjs/common';
import { ProfitabilityController } from './profitability.controller';
import { ProfitabilityService } from './profitability.service';
import { NetProfitabilityService } from './net-profitability.service';
import { ProfitabilityConfigService } from './profitability-config.service';
import { CostCenterService } from './cost-center.service';
import { BudgetingService } from './budgeting.service';
import { CashFlowForecastService } from './cash-flow-forecast.service';

@Module({
  controllers: [ProfitabilityController],
  providers: [
    ProfitabilityService,
    NetProfitabilityService,
    ProfitabilityConfigService,
    CostCenterService,
    BudgetingService,
    CashFlowForecastService,
  ],
  exports: [
    ProfitabilityService,
    NetProfitabilityService,
    ProfitabilityConfigService,
    CostCenterService,
    BudgetingService,
    CashFlowForecastService,
  ],
})
export class ProfitabilityModule {}
