import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { MarketingFinanceHandoffService } from './marketing-finance-handoff.service';

const postingSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().trim().max(100).optional(),
  dueAt: z.coerce.date().optional(),
});

@Controller('marketing-finance')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class MarketingFinanceController {
  constructor(private readonly service: MarketingFinanceHandoffService) {}

  @Get('expenses')
  @RequirePermission('finance', 'read')
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Post('expenses/:id/account')
  @RequirePermission('finance', 'manage')
  account(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.postToAccountsPayable(id, postingSchema.parse(body), user.sub);
  }
}
