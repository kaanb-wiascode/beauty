import { Module } from '@nestjs/common';
import { CorporateCommunicationsController } from './corporate-communications.controller';
import { CorporateCommunicationsService } from './corporate-communications.service';
import { MarketingLeadConversionController } from './marketing-lead-conversion.controller';
import { MarketingLeadConversionService } from './marketing-lead-conversion.service';

@Module({
  controllers: [
    CorporateCommunicationsController,
    MarketingLeadConversionController,
  ],
  providers: [CorporateCommunicationsService, MarketingLeadConversionService],
  exports: [CorporateCommunicationsService, MarketingLeadConversionService],
})
export class CorporateCommunicationsModule {}
