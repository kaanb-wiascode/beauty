import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { ExpensePaymentsService } from './expense-payments.service';

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentAccountId: z.string().uuid(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']),
  reference: z.string().trim().max(150).optional(),
  note: z.string().trim().max(500).optional(),
  paidAt: z.coerce.date().optional(),
  sourceType: z.string().trim().max(100).optional(),
  sourceId: z.string().trim().max(150).optional(),
});

const reversalSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  sourceType: z.string().trim().max(100).optional(),
  sourceId: z.string().trim().max(150).optional(),
});

@Controller('finance/expenses')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class ExpensePaymentsController {
  constructor(private readonly service: ExpensePaymentsService) {}

  @Get(':id/payments')
  list(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.list(id);
  }

  @Post(':id/payments')
  @RequirePermission('finance', 'manage')
  record(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.record(id, paymentSchema.parse(body), user.sub);
  }

  @Post(':id/payments/:paymentId/reverse')
  @RequirePermission('finance', 'manage')
  reverse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reverse(id, paymentId, reversalSchema.parse(body), user.sub);
  }
}
