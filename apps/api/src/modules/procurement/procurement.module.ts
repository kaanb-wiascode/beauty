import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';
import { ProcurementApprovalsService } from './procurement-approvals.service';
import { ProcurementReturnsService } from './procurement-returns.service';
import { ProcurementReturnRequestsService } from './procurement-return-requests.service';
import { ProcurementReplacementsService } from './procurement-replacements.service';

@Module({
  controllers: [ProcurementController],
  providers: [
    ProcurementService,
    ProcurementRequestsService,
    ProcurementApprovalsService,
    ProcurementReturnsService,
    ProcurementReturnRequestsService,
    ProcurementReplacementsService,
  ],
  exports: [
    ProcurementService,
    ProcurementRequestsService,
    ProcurementApprovalsService,
    ProcurementReturnsService,
    ProcurementReturnRequestsService,
    ProcurementReplacementsService,
  ],
})
export class ProcurementModule {}
