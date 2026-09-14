import { Module } from '@nestjs/common';
import { CrmCommercialController } from './crm-commercial.controller';
import { CrmController } from './crm.controller';
import { CrmOperationsController } from './crm-operations.controller';
import { CrmOperationsService } from './crm-operations.service';
import { CrmOpportunityCommercialService } from './crm-opportunity-commercial.service';
import { CrmOpportunityService } from './crm-opportunity.service';
import { CrmService } from './crm.service';

@Module({
  controllers: [CrmController, CrmOperationsController, CrmCommercialController],
  providers: [
    CrmService,
    CrmOpportunityService,
    CrmOperationsService,
    CrmOpportunityCommercialService,
  ],
  exports: [CrmService, CrmOpportunityService, CrmOperationsService],
})
export class CrmModule {}
