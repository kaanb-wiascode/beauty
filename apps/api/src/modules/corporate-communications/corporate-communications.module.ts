import { Module } from '@nestjs/common';
import { AccountsPayableModule } from '../accounts-payable/accounts-payable.module';
import { BrandGovernanceController } from './brand-governance.controller';
import { BrandGovernanceService } from './brand-governance.service';
import { ContentOperationsController } from './content-operations.controller';
import { ContentOperationsService } from './content-operations.service';
import { CorporateCommunicationsController } from './corporate-communications.controller';
import { CorporateCommunicationsService } from './corporate-communications.service';
import { DigitalAssetsController } from './digital-assets.controller';
import { DigitalAssetsService } from './digital-assets.service';
import { MarketingExpenseSyncService } from './marketing-expense-sync.service';
import { MarketingFinanceController } from './marketing-finance.controller';
import { MarketingFinanceHandoffService } from './marketing-finance-handoff.service';
import { MarketingLeadConversionController } from './marketing-lead-conversion.controller';
import { MarketingLeadAppointmentService } from './marketing-lead-appointment.service';
import { MarketingLeadCrmBridgeService } from './marketing-lead-crm-bridge.service';
import { MarketingLeadCustomerBridgeService } from './marketing-lead-customer-bridge.service';

@Module({
  imports: [AccountsPayableModule],
  controllers: [
    CorporateCommunicationsController,
    BrandGovernanceController,
    ContentOperationsController,
    DigitalAssetsController,
    MarketingFinanceController,
    MarketingLeadConversionController,
  ],
  providers: [
    CorporateCommunicationsService,
    BrandGovernanceService,
    ContentOperationsService,
    DigitalAssetsService,
    MarketingExpenseSyncService,
    MarketingFinanceHandoffService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
  exports: [
    CorporateCommunicationsService,
    BrandGovernanceService,
    ContentOperationsService,
    DigitalAssetsService,
    MarketingExpenseSyncService,
    MarketingFinanceHandoffService,
    MarketingLeadAppointmentService,
    MarketingLeadCrmBridgeService,
    MarketingLeadCustomerBridgeService,
  ],
})
export class CorporateCommunicationsModule {}
