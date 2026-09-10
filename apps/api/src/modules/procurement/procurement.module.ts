import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';
import { ProcurementApprovalsService } from './procurement-approvals.service';

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService, ProcurementRequestsService, ProcurementApprovalsService],
  exports: [ProcurementService, ProcurementRequestsService, ProcurementApprovalsService],
})
export class ProcurementModule {}
