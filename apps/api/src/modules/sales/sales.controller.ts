import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { SalesService } from './sales.service';

const createSaleSchema = z.object({
  customerId: z.string().uuid(),
  discountTotal: z.coerce.number().min(0).default(0),
  items: z.array(z.object({
    type: z.enum(['SERVICE', 'PACKAGE']),
    referenceId: z.string().uuid(),
    quantity: z.coerce.number().int().positive().default(1),
  })).min(1),
});

const addSalePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().trim().max(150).optional(),
  note: z.string().trim().max(500).optional(),
});

const refundSalePaymentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

@Controller('sales')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('payments', 'read')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @RequirePermission('payments', 'create')
  create(@Body() body: unknown) {
    return this.salesService.create(createSaleSchema.parse(body));
  }

  @Get()
  findAll() {
    return this.salesService.findAll();
  }

  @Get(':id/payment-summary')
  getPaymentSummary(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.salesService.getPaymentSummary(id);
  }

  @Post(':id/payments')
  @RequirePermission('payments', 'create')
  addPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.salesService.addPayment(id, addSalePaymentSchema.parse(body));
  }

  @Post(':id/payments/:paymentId/refund')
  @RequirePermission('payments', 'refund')
  refundPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() body: unknown,
  ) {
    return this.salesService.refundPayment(id, paymentId, refundSalePaymentSchema.parse(body));
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.salesService.findOne(id);
  }

  @Post(':id/confirm')
  @RequirePermission('payments', 'create')
  confirm(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.salesService.confirm(id);
  }

  @Post(':id/cancel')
  @RequirePermission('payments', 'create')
  cancel(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.salesService.cancel(id);
  }
}
