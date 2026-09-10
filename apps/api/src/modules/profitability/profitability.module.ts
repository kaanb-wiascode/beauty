import { Module } from '@nestjs/common';
import { ProfitabilityController } from './profitability.controller';
import { ProfitabilityService } from './profitability.service';
import { NetProfitabilityService } from './net-profitability.service';
import { ProfitabilityConfigService } from './profitability-config.service';
import { CostCenterService } from './cost-center.service';

@Module({
  controllers: [ProfitabilityController],
  providers: [ProfitabilityService, NetProfitabilityService, ProfitabilityConfigService, CostCenterService],
  exports: [ProfitabilityService, NetProfitabilityService, ProfitabilityConfigService, CostCenterService],
})
export class ProfitabilityModule {}
