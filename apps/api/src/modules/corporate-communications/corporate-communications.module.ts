import { Module } from '@nestjs/common';
import { CorporateCommunicationsController } from './corporate-communications.controller';
import { CorporateCommunicationsService } from './corporate-communications.service';
import { MarketingLeadConversionController } from './marketing-lead-conversion.controller';
import { MarketingLeadCrmBridgeService } from './marketing-lead-crm-bridge.service';

@Module({
  controllers: [
    CorporateCommunicationsController,
    MarketingLeadConversionController,
  ],
  providers: [CorporateCommunicationsService, MarketingLeadCrmBridgeService],
  exports: [CorporateCommunicationsService, MarketingLeadCrmBridgeService],
})
export class CorporateCommunicationsModule {}
