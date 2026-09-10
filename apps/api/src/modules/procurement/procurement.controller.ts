import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProcurementService } from './procurement.service';
import { ProcurementRequestsService } from './procurement-requests.service';

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

const receiptListSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
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

  @Post('purchase-orders/:id/order')
  orderPurchaseOrder(@Param('id') id: string) {
    return this.service.orderPurchaseOrder(id);
  }

  @Post('purchase-orders/:id/receive')
  receivePurchaseOrder(@Param('id') id: string, @Body() body: unknown) {
    return this.service.receivePurchaseOrder(id, receiveSchema.parse(body));
  }

  @Get('goods-receipts')
  listGoodsReceipts(@Query() query: unknown) {
    const parsed = receiptListSchema.parse(query);
    return this.service.listGoodsReceipts(parsed.purchaseOrderId);
  }
}
