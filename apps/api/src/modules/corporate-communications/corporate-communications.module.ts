import { Module } from '@nestjs/common';
import { CorporateCommunicationsController } from './corporate-communications.controller';
import { CorporateCommunicationsService } from './corporate-communications.service';
import { MarketingAttributionService } from './marketing-attribution.service';
import { MarketingLeadConversionController } from './marketing-lead-conversion.controller';
import { MarketingLeadAppointmentService } from './marketing-lead-appointment.service';
import { MarketingLeadCrmBridgeService } from './marketing-lead-crm-bridge.service';
import { MarketingLeadCustomerBridgeService } from './marketing-lead-customer-bridge.service';

@Module({
  controllers: [
    CorporateCommunicationsController,
    MarketingLeadConversionController,
  ],
  providers: [
    CorporateCommunicationsService,
    MarketingAttributionService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
  exports: [
    CorporateCommunicationsService,
    MarketingAttributionService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
})
export class CorporateCommunicationsModule {}
