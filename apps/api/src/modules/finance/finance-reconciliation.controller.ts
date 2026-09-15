import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { FinanceReconciliationService } from './finance-reconciliation.service';

const matchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  amount: z.coerce.number().positive().optional(),
});

const reversalSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

@Controller('finance/reconciliation')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class FinanceReconciliationController {
  constructor(private readonly service: FinanceReconciliationService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    const parsed = z.coerce.number().int().min(1).max(500).default(100).parse(limit ?? 100);
    return this.service.list(parsed);
  }

  @Get('expense-payments/:paymentId/suggestions')
  suggestExpensePayment(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = z.coerce.number().int().min(1).max(14).default(3).parse(days ?? 3);
    return this.service.suggestExpensePayment(paymentId, parsedDays);
  }

  @Get('income-collections/:collectionId/suggestions')
  suggestIncomeCollection(
    @Param('collectionId', new ParseUUIDPipe()) collectionId: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = z.coerce.number().int().min(1).max(14).default(3).parse(days ?? 3);
    return this.service.suggestIncomeCollection(collectionId, parsedDays);
  }

  @Post('auto-match')
  @RequirePermission('finance', 'manage')
  autoMatch(
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const parsedLimit = z.coerce.number().int().min(1).max(500).default(100).parse(limit ?? 100);
    return this.service.autoMatch(user.sub, parsedLimit);
  }

  @Post('expense-payments/:paymentId/match')
  @RequirePermission('finance', 'manage')
  matchExpensePayment(
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const input = matchSchema.parse(body);
    return this.service.matchExpensePayment(paymentId, input.bankTransactionId, user.sub, input.amount);
  }

  @Post('income-collections/:collectionId/match')
  @RequirePermission('finance', 'manage')
  matchIncomeCollection(
    @Param('collectionId', new ParseUUIDPipe()) collectionId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const input = matchSchema.parse(body);
    return this.service.matchIncomeCollection(collectionId, input.bankTransactionId, user.sub, input.amount);
  }

  @Post(':matchId/reverse')
  @RequirePermission('finance', 'manage')
  reverse(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const input = reversalSchema.parse(body);
    return this.service.reverse(matchId, user.sub, input.reason);
  }
}
