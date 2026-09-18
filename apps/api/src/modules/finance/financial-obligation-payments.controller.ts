import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { FinancialObligationPaymentsService } from './financial-obligation-payments.service';

const allocationSchema = z.object({
  expensePaymentId: z.string().uuid(),
  amount: z.coerce.number().positive().optional(),
});

const reversalSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

@Controller('finance/obligations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class FinancialObligationPaymentsController {
  constructor(private readonly service: FinancialObligationPaymentsService) {}

  @Get(':id/payment-allocations')
  list(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.list(id);
  }

  @Post(':id/payment-allocations')
  @RequirePermission('finance', 'manage')
  allocate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const input = allocationSchema.parse(body);
    return this.service.allocate(id, input.expensePaymentId, input.amount, user.sub);
  }

  @Post(':id/payment-allocations/:allocationId/reverse')
  @RequirePermission('finance', 'manage')
  reverse(
    @Param('allocationId', new ParseUUIDPipe()) allocationId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const input = reversalSchema.parse(body);
    return this.service.reverse(allocationId, user.sub, input.reason);
  }
}
