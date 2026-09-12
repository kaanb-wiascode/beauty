import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';
import { ProcurementApprovalsService } from './procurement-approvals.service';
import { ProcurementReturnsService } from './procurement-returns.service';
import { ProcurementReturnRequestsService } from './procurement-return-requests.service';
import { ProcurementReplacementsService } from './procurement-replacements.service';

const receiveSchema = z.object({
  items: z.array(z.object({ purchaseOrderItemId: z.string().uuid(), quantity: z.coerce.number().positive() })).min(1),
  invoiceNumber: z.string().trim().max(100).optional(),
  dueAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});
const reverseReceiptSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const partialReturnSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  items: z.array(z.object({ goodsReceiptItemId: z.string().uuid(), quantity: z.coerce.number().positive() })).min(1),
});
const rejectReturnSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const returnRequestListSchema = z.object({ status: z.enum(['PENDING','APPROVED','REJECTED','EXECUTED']).optional() });
const receiptListSchema = z.object({ purchaseOrderId: z.string().uuid().optional() });
const returnListSchema = z.object({ goodsReceiptId: z.string().uuid().optional() });
const creditNoteListSchema = z.object({ supplierBillId: z.string().uuid().optional() });
const purchaseRequestListSchema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'ORDERED', 'CANCELLED']).optional() });
const convertPurchaseRequestSchema = z.object({ supplierId: z.string().uuid(), unitCost: z.coerce.number().min(0), note: z.string().trim().max(500).optional() });
const replacementRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  items: z.array(z.object({ purchaseReturnItemId: z.string().uuid(), quantity: z.coerce.number().positive() })).min(1),
});
const replacementListSchema = z.object({ status: z.enum(['PENDING','APPROVED','REJECTED','RECEIVED']).optional() });
const rejectReplacementSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const receiveReplacementSchema = z.object({ note: z.string().trim().max(500).optional() });

@Controller('procurement')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class ProcurementController {
  constructor(
    private readonly service: ProcurementService,
    private readonly requests: ProcurementRequestsService,
    private readonly approvals: ProcurementApprovalsService,
    private readonly returns: ProcurementReturnsService,
    private readonly returnRequests: ProcurementReturnRequestsService,
    private readonly replacements: ProcurementReplacementsService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing.');
    return userId;
  }

  @Get('purchase-requests')
  listPurchaseRequests(@Query() query: unknown) { const parsed = purchaseRequestListSchema.parse(query); return this.requests.listPurchaseRequests(parsed.status); }

  @Post('purchase-requests/:id/approve')
  @RequirePermission('inventory', 'write')
  approvePurchaseRequest(@Param('id') id: string) { return this.requests.approvePurchaseRequest(id); }

  @Post('purchase-requests/:id/convert')
  @RequirePermission('inventory', 'write')
  convertPurchaseRequest(@Param('id') id: string, @Body() body: unknown) { return this.requests.convertPurchaseRequest(id, convertPurchaseRequestSchema.parse(body)); }

  @Get('purchase-orders/:id')
  getPurchaseOrder(@Param('id') id: string) { return this.service.getPurchaseOrderDetail(id); }

  @Post('purchase-orders/:id/submit-approval')
  @RequirePermission('inventory', 'write')
  submitPurchaseOrderApproval(@Param('id') id: string) { return this.approvals.submit(id); }

  @Get('purchase-orders/:id/approvals')
  getPurchaseOrderApprovals(@Param('id') id: string) { return this.approvals.getState(id); }

  @Post('purchase-orders/:id/approvals/:level/approve')
  @RequirePermission('inventory', 'write')
  approvePurchaseOrderLevel(@Param('id') id: string, @Param('level') level: string, @Req() req: { user?: { sub?: string } }) { return this.approvals.approve(id, Number(level), this.userId(req)); }

  @Post('purchase-orders/:id/approvals/:level/reject')
  @RequirePermission('inventory', 'write')
  rejectPurchaseOrderLevel(@Param('id') id: string, @Param('level') level: string, @Req() req: { user?: { sub?: string } }) { return this.approvals.reject(id, Number(level), this.userId(req)); }

  @Post('purchase-orders/:id/order')
  @RequirePermission('inventory', 'write')
  orderPurchaseOrder(@Param('id') id: string) { return this.service.orderPurchaseOrder(id); }

  @Post('purchase-orders/:id/receive')
  @RequirePermission('inventory', 'write')
  receivePurchaseOrder(@Param('id') id: string, @Body() body: unknown) { return this.service.receivePurchaseOrder(id, receiveSchema.parse(body)); }

  @Post('goods-receipts/:id/reverse')
  @RequirePermission('inventory', 'write')
  reverseGoodsReceipt(@Param('id') id: string, @Body() body: unknown) { return this.service.reverseGoodsReceipt(id, reverseReceiptSchema.parse(body)); }

  @Post('goods-receipts/:id/partial-return')
  @RequirePermission('inventory', 'write')
  partialReturn(@Param('id') id: string, @Body() body: unknown) { return this.returns.partialReturn(id, partialReturnSchema.parse(body)); }

  @Post('goods-receipts/:id/return-requests')
  @RequirePermission('inventory', 'write')
  submitReturnRequest(@Param('id') id: string, @Body() body: unknown, @Req() req: { user?: { sub?: string } }) {
    return this.returnRequests.submit(id, partialReturnSchema.parse(body), this.userId(req));
  }

  @Get('return-requests')
  listReturnRequests(@Query() query: unknown) { const parsed = returnRequestListSchema.parse(query); return this.returnRequests.list(parsed.status); }

  @Post('return-requests/:id/approve')
  @RequirePermission('inventory', 'write')
  approveReturnRequest(@Param('id') id: string, @Req() req: { user?: { sub?: string } }) { return this.returnRequests.approve(id, this.userId(req)); }

  @Post('return-requests/:id/reject')
  @RequirePermission('inventory', 'write')
  rejectReturnRequest(@Param('id') id: string, @Body() body: unknown, @Req() req: { user?: { sub?: string } }) { return this.returnRequests.reject(id, this.userId(req), rejectReturnSchema.parse(body).reason); }

  @Post('return-requests/:id/execute')
  @RequirePermission('inventory', 'write')
  executeReturnRequest(@Param('id') id: string) { return this.returnRequests.execute(id); }

  @Post('purchase-returns/:id/replacement-requests')
  @RequirePermission('inventory', 'write')
  submitReplacementRequest(@Param('id') id: string, @Body() body: unknown, @Req() req: { user?: { sub?: string } }) {
    return this.replacements.submit(id, replacementRequestSchema.parse(body), this.userId(req));
  }

  @Get('replacement-requests')
  listReplacementRequests(@Query() query: unknown) {
    const parsed = replacementListSchema.parse(query);
    return this.replacements.list(parsed.status);
  }

  @Post('replacement-requests/:id/approve')
  @RequirePermission('inventory', 'write')
  approveReplacementRequest(@Param('id') id: string, @Req() req: { user?: { sub?: string } }) {
    return this.replacements.approve(id, this.userId(req));
  }

  @Post('replacement-requests/:id/reject')
  @RequirePermission('inventory', 'write')
  rejectReplacementRequest(@Param('id') id: string, @Body() body: unknown, @Req() req: { user?: { sub?: string } }) {
    return this.replacements.reject(id, this.userId(req), rejectReplacementSchema.parse(body).reason);
  }

  @Post('replacement-requests/:id/receive')
  @RequirePermission('inventory', 'write')
  receiveReplacementRequest(@Param('id') id: string, @Body() body: unknown, @Req() req: { user?: { sub?: string } }) {
    return this.replacements.receive(id, this.userId(req), receiveReplacementSchema.parse(body ?? {}).note);
  }

  @Get('goods-receipts')
  listGoodsReceipts(@Query() query: unknown) { const parsed = receiptListSchema.parse(query); return this.service.listGoodsReceipts(parsed.purchaseOrderId); }

  @Get('purchase-returns')
  listPurchaseReturns(@Query() query: unknown) { const parsed = returnListSchema.parse(query); return this.returns.listReturns(parsed.goodsReceiptId); }

  @Get('supplier-credit-notes')
  listSupplierCreditNotes(@Query() query: unknown) { const parsed = creditNoteListSchema.parse(query); return this.returns.listCreditNotes(parsed.supplierBillId); }
}
