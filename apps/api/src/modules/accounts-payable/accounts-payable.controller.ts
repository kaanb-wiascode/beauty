import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class AccountsPayableController {
  constructor(
    private readonly service: AccountsPayableService,
    private readonly reversalsService: AccountsPayableReversalsService,
    private readonly creditAnalytics: AccountsPayableCreditAnalyticsService,
  ) {}

  @Post('bills')
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
  supplierLedger(@Param('supplierId') supplierId: string) {
    return this.creditAnalytics.supplierLedger(supplierId);
  }

  @Get('bills/:id')
  getBill(@Param('id') id: string) {
    return this.service.getBill(id);
  }

  @Post('bills/:id/payments')
  payBill(@Param('id') id: string, @Body() body: unknown) {
    return this.service.payBill(id, payBillSchema.parse(body));
  }

  @Post('bills/:id/payments/:paymentId/reverse')
  reversePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    const input = reversePaymentSchema.parse(body);
    return this.reversalsService.reversePayment(id, paymentId, input.reason);
  }

  @Post('bills/:id/cancel')
  cancelBill(@Param('id') id: string, @Body() body: unknown) {
    return this.service.cancelBill(id, cancelBillSchema.parse(body));
  }
}
