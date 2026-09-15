import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { ExpenseAccountingService } from './expense-accounting.service';

const mappingSchema = z.object({
  categoryId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  taxAccountId: z.string().uuid().optional(),
  payableAccountId: z.string().uuid(),
  withholdingAccountId: z.string().uuid().optional(),
});

const reversalSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

@Controller('finance')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class ExpenseAccountingController {
  constructor(private readonly service: ExpenseAccountingService) {}

  @Get('setup/expense-accounting-mappings')
  listMappings() {
    return this.service.listMappings();
  }

  @Put('setup/expense-accounting-mappings')
  @RequirePermission('finance', 'manage')
  upsertMapping(@Body() body: unknown) {
    return this.service.upsertMapping(mappingSchema.parse(body));
  }

  @Post('expenses/:id/accounting/prepare')
  @RequirePermission('finance', 'manage')
  prepare(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.prepare(id, user.sub);
  }

  @Post('expenses/:id/accounting/post')
  @RequirePermission('finance', 'manage')
  post(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.post(id, user.sub);
  }

  @Post('expenses/:id/accounting/reverse')
  @RequirePermission('finance', 'manage')
  reverse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const input = reversalSchema.parse(body);
    return this.service.reverse(id, user.sub, input.reason);
  }
}
