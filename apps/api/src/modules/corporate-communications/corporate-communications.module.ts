import { Module } from '@nestjs/common';
import { CorporateCommunicationsController } from './corporate-communications.controller';
import { CorporateCommunicationsService } from './corporate-communications.service';
import { MarketingLeadConversionService } from './marketing-lead-conversion.service';

@Module({
  controllers: [CorporateCommunicationsController],
  providers: [CorporateCommunicationsService, MarketingLeadConversionService],
  exports: [CorporateCommunicationsService, MarketingLeadConversionService],
})
export class CorporateCommunicationsModule {}
