import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';
import { ProcurementApprovalsService } from './procurement-approvals.service';
import { ProcurementReturnsService } from './procurement-returns.service';
import { ProcurementReturnRequestsService } from './procurement-return-requests.service';

const receiveSchema = z.object({
  items: z.array(
    z.object({
      purchaseOrderItemId: z.string().uuid(),
      quantity: z.coerce.number().positive(),
    }),
  ).min(1),
  invoiceNumber: z.string().trim().max(100).optional(),
  dueAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});

const reverseReceiptSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const partialReturnSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  items: z.array(z.object({
    goodsReceiptItemId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
  })).min(1),
});

const rejectReturnSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const returnRequestListSchema = z.object({
  status: z.enum(['PENDING','APPROVED','REJECTED','EXECUTED']).optional(),
});

const receiptListSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
});

const returnListSchema = z.object({
  goodsReceiptId: z.string().uuid().optional(),
});

const creditNoteListSchema = z.object({
  supplierBillId: z.string().uuid().optional(),
});

const purchaseRequestListSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'ORDERED', 'CANCELLED']).optional(),
});

const convertPurchaseRequestSchema = z.object({
  supplierId: z.string().uuid(),
  unitCost: z.coerce.number().min(0),
  note: z.string().trim().max(500).optional(),
});

@Controller('procurement')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class ProcurementController {
  constructor(
    private readonly service: ProcurementService,
    private readonly requests: ProcurementRequestsService,
    private readonly approvals: ProcurementApprovalsService,
    private readonly returns: ProcurementReturnsService,
    private readonly returnRequests: ProcurementReturnRequestsService,
  ) {}

  @Get('purchase-requests')
  listPurchaseRequests(@Query() query: unknown) {
    const parsed = purchaseRequestListSchema.parse(query);
    return this.requests.listPurchaseRequests(parsed.status);
  }

  @Post('purchase-requests/:id/approve')
  approvePurchaseRequest(@Param('id') id: string) {
    return this.requests.approvePurchaseRequest(id);
  }

  @Post('purchase-requests/:id/convert')
  convertPurchaseRequest(@Param('id') id: string, @Body() body: unknown) {
    return this.requests.convertPurchaseRequest(id, convertPurchaseRequestSchema.parse(body));
  }

  @Post('purchase-orders/:id/submit-approval')
  submitPurchaseOrderApproval(@Param('id') id: string) {
    return this.approvals.submit(id);
  }

  @Get('purchase-orders/:id/approvals')
  getPurchaseOrderApprovals(@Param('id') id: string) {
    return this.approvals.getState(id);
  }

  @Post('purchase-orders/:id/approvals/:level/approve')
  approvePurchaseOrderLevel(
    @Param('id') id: string,
    @Param('level') level: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return this.approvals.approve(id, Number(level), userId);
  }

  @Post('purchase-orders/:id/approvals/:level/reject')
  rejectPurchaseOrderLevel(
    @Param('id') id: string,
    @Param('level') level: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return this.approvals.reject(id, Number(level), userId);
  }

  @Post('purchase-orders/:id/order')
  orderPurchaseOrder(@Param('id') id: string) {
    return this.service.orderPurchaseOrder(id);
  }

  @Post('purchase-orders/:id/receive')
  receivePurchaseOrder(@Param('id') id: string, @Body() body: unknown) {
    return this.service.receivePurchaseOrder(id, receiveSchema.parse(body));
  }

  @Post('goods-receipts/:id/reverse')
  reverseGoodsReceipt(@Param('id') id: string, @Body() body: unknown) {
    return this.service.reverseGoodsReceipt(id, reverseReceiptSchema.parse(body));
  }

  @Post('goods-receipts/:id/partial-return')
  partialReturn(@Param('id') id: string, @Body() body: unknown) {
    return this.returns.partialReturn(id, partialReturnSchema.parse(body));
  }

  @Post('goods-receipts/:id/return-requests')
  submitReturnRequest(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return this.returnRequests.submit(id, partialReturnSchema.parse(body), userId);
  }

  @Get('return-requests')
  listReturnRequests(@Query() query: unknown) {
    const parsed = returnRequestListSchema.parse(query);
    return this.returnRequests.list(parsed.status);
  }

  @Post('return-requests/:id/approve')
  approveReturnRequest(
    @Param('id') id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return this.returnRequests.approve(id, userId);
  }

  @Post('return-requests/:id/reject')
  rejectReturnRequest(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return this.returnRequests.reject(id, userId, rejectReturnSchema.parse(body).reason);
  }

  @Post('return-requests/:id/execute')
  executeReturnRequest(@Param('id') id: string) {
    return this.returnRequests.execute(id);
  }

  @Get('goods-receipts')
  listGoodsReceipts(@Query() query: unknown) {
    const parsed = receiptListSchema.parse(query);
    return this.service.listGoodsReceipts(parsed.purchaseOrderId);
  }

  @Get('purchase-returns')
  listPurchaseReturns(@Query() query: unknown) {
    const parsed = returnListSchema.parse(query);
    return this.returns.listReturns(parsed.goodsReceiptId);
  }

  @Get('supplier-credit-notes')
  listSupplierCreditNotes(@Query() query: unknown) {
    const parsed = creditNoteListSchema.parse(query);
    return this.returns.listCreditNotes(parsed.supplierBillId);
  }
}
