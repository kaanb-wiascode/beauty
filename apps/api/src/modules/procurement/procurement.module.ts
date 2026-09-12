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
import { ProcurementReturnQueryService } from './procurement-return-query.service';
import { ProcurementReturnQueryController } from './procurement-return-query.controller';
import { ProcurementRfqController } from './procurement-rfq.controller';
import { ProcurementRfqOptionsService } from './procurement-rfq-options.service';
import { ProcurementRfqService } from './procurement-rfq.service';
import { ProcurementOfferOrderController } from './procurement-offer-order.controller';
import { ProcurementOfferOrderService } from './procurement-offer-order.service';

@Module({
  controllers: [
    ProcurementController,
    ProcurementReceiptQueryController,
    ProcurementReturnQueryController,
    ProcurementRfqController,
    ProcurementOfferOrderController,
  ],
  providers: [
    ProcurementService,
    ProcurementRequestsService,
    ProcurementApprovalsService,
    ProcurementReturnsService,
    ProcurementReturnRequestsService,
    ProcurementReplacementsService,
    ProcurementOrdersQueryService,
    ProcurementReceiptQueryService,
    ProcurementReturnQueryService,
    ProcurementRfqOptionsService,
    ProcurementRfqService,
    ProcurementOfferOrderService,
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
    ProcurementReturnQueryService,
    ProcurementRfqOptionsService,
    ProcurementRfqService,
    ProcurementOfferOrderService,
  ],
})
export class ProcurementModule {}
