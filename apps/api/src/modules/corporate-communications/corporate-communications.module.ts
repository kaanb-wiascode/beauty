import { Module } from '@nestjs/common';
import { ContentOperationsController } from './content-operations.controller';
import { ContentOperationsService } from './content-operations.service';
import { CorporateCommunicationsController } from './corporate-communications.controller';
import { CorporateCommunicationsService } from './corporate-communications.service';
import { MarketingLeadConversionController } from './marketing-lead-conversion.controller';
import { MarketingLeadAppointmentService } from './marketing-lead-appointment.service';
import { MarketingLeadCrmBridgeService } from './marketing-lead-crm-bridge.service';
import { MarketingLeadCustomerBridgeService } from './marketing-lead-customer-bridge.service';

@Module({
  controllers: [
    CorporateCommunicationsController,
    ContentOperationsController,
    MarketingLeadConversionController,
  ],
  providers: [
    CorporateCommunicationsService,
    ContentOperationsService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
  exports: [
    CorporateCommunicationsService,
    ContentOperationsService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
})
export class CorporateCommunicationsModule {}
