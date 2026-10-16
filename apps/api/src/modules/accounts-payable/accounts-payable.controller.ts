import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { AccountsPayableService } from './accounts-payable.service';
import { AccountsPayableReversalsService } from './accounts-payable-reversals.service';
import { AccountsPayableCreditAnalyticsService } from './accounts-payable-credit-analytics.service';

const createBillSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().trim().max(100).optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().positive(),
  dueAt: z.coerce.date().optional(),
});

const payBillSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().trim().max(150).optional(),
  note: z.string().trim().max(500).optional(),
});

const cancelBillSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const reversePaymentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const listSchema = z.object({
  status: z.enum(['OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']).optional(),
  supplierId: z.string().uuid().optional(),
});

@Controller('accounts-payable')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class AccountsPayableController {
  constructor(
    private readonly service: AccountsPayableService,
    private readonly reversalsService: AccountsPayableReversalsService,
    private readonly creditAnalytics: AccountsPayableCreditAnalyticsService,
  ) {}

  @Post('bills')
  @RequirePermission('finance', 'manage')
  createBill(@Body() body: unknown) {
    return this.service.createBill(createBillSchema.parse(body));
  }

  @Get('bills')
  listBills(@Query() query: unknown) {
    return this.service.listBills(listSchema.parse(query));
  }

  @Get('summary')
  summary() {
    return this.creditAnalytics.summary();
  }

  @Get('aging')
  aging() {
    return this.creditAnalytics.aging();
  }

  @Get('suppliers/:supplierId/ledger')
  supplierLedger(
    @Param('supplierId', new ParseUUIDPipe()) supplierId: string,
  ) {
    return this.creditAnalytics.supplierLedger(supplierId);
  }

  @Get('bills/:id')
  getBill(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getBill(id);
  }

  @Post('bills/:id/payments')
  @RequirePermission('finance', 'manage')
  payBill(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.service.payBill(id, payBillSchema.parse(body));
  }

  @Post('bills/:id/payments/:paymentId/reverse')
  @RequirePermission('finance', 'manage')
  reversePayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() body: unknown,
  ) {
    const input = reversePaymentSchema.parse(body);
    return this.reversalsService.reversePayment(id, paymentId, input.reason);
  }

  @Post('bills/:id/cancel')
  @RequirePermission('finance', 'manage')
  cancelBill(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.service.cancelBill(id, cancelBillSchema.parse(body));
  }
}
