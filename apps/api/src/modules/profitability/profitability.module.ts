import { Module } from '@nestjs/common';
import { ProfitabilityController } from './profitability.controller';
import { ProfitabilityService } from './profitability.service';
import { NetProfitabilityService } from './net-profitability.service';
import { ProfitabilityConfigService } from './profitability-config.service';

@Module({
  controllers: [ProfitabilityController],
  providers: [ProfitabilityService, NetProfitabilityService, ProfitabilityConfigService],
  exports: [ProfitabilityService, NetProfitabilityService, ProfitabilityConfigService],
})
export class ProfitabilityModule {}
