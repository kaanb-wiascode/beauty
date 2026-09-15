import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ExpenseAccountingService } from './expense-accounting.service';

const mappingSchema = z.object({
  categoryId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  taxAccountId: z.string().uuid().optional(),
  payableAccountId: z.string().uuid(),
  withholdingAccountId: z.string().uuid().optional(),
});

@Controller('finance')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
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
}
