import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmOperationsService } from './crm-operations.service';
import { CrmOpportunityService } from './crm-opportunity.service';
import { CrmService } from './crm.service';

@Module({
  controllers: [CrmController],
  providers: [CrmService, CrmOpportunityService, CrmOperationsService],
  exports: [CrmService, CrmOpportunityService, CrmOperationsService],
})
export class CrmModule {}
