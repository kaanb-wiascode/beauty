import { Module } from '@nestjs/common';
import { BrandGovernanceController } from './brand-governance.controller';
import { BrandGovernanceService } from './brand-governance.service';
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
    BrandGovernanceController,
    ContentOperationsController,
    MarketingLeadConversionController,
  ],
  providers: [
    CorporateCommunicationsService,
    BrandGovernanceService,
    ContentOperationsService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
  exports: [
    CorporateCommunicationsService,
    BrandGovernanceService,
    ContentOperationsService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
})
export class CorporateCommunicationsModule {}
