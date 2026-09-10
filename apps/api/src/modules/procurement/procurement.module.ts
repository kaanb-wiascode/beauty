import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';
import { ProcurementApprovalsService } from './procurement-approvals.service';
import { ProcurementReturnsService } from './procurement-returns.service';

@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService, ProcurementRequestsService, ProcurementApprovalsService, ProcurementReturnsService],
  exports: [ProcurementService, ProcurementRequestsService, ProcurementApprovalsService, ProcurementReturnsService],
})
export class ProcurementModule {}
