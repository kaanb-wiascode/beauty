import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmOpportunityService } from './crm-opportunity.service';
import { CrmService } from './crm.service';

@Module({
  controllers: [CrmController],
  providers: [CrmService, CrmOpportunityService],
  exports: [CrmService, CrmOpportunityService],
})
export class CrmModule {}
