import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';
import { ProcurementApprovalsService } from './procurement-approvals.service';
import { ProcurementReturnsService } from './procurement-returns.service';
import { ProcurementReturnRequestsService } from './procurement-return-requests.service';
import { ProcurementReplacementsService } from './procurement-replacements.service';
import { ProcurementOrdersQueryService } from './procurement-orders-query.service';
import { ProcurementReceiptQueryService } from './procurement-receipt-query.service';
import { ProcurementReceiptQueryController } from './procurement-receipt-query.controller';

@Module({
  controllers: [ProcurementController, ProcurementReceiptQueryController],
  providers: [
    ProcurementService,
    ProcurementRequestsService,
    ProcurementApprovalsService,
    ProcurementReturnsService,
    ProcurementReturnRequestsService,
    ProcurementReplacementsService,
    ProcurementOrdersQueryService,
    ProcurementReceiptQueryService,
  ],
  exports: [
    ProcurementService,
    ProcurementRequestsService,
    ProcurementApprovalsService,
    ProcurementReturnsService,
    ProcurementReturnRequestsService,
    ProcurementReplacementsService,
    ProcurementOrdersQueryService,
    ProcurementReceiptQueryService,
  ],
})
export class ProcurementModule {}
