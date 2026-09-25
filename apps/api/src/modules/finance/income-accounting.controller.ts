import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { IncomeAccountingService } from './income-accounting.service';

const mappingSchema = z.object({
  categoryId: z.string().uuid(),
  revenueAccountId: z.string().uuid(),
  taxAccountId: z.string().uuid().optional(),
  receivableAccountId: z.string().uuid(),
});

@Controller('finance')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class IncomeAccountingController {
  constructor(private readonly service: IncomeAccountingService) {}

  @Get('setup/income-accounting-mappings')
  listMappings() {
    return this.service.listMappings();
  }

  @Put('setup/income-accounting-mappings')
  @RequirePermission('finance', 'manage')
  upsertMapping(@Body() body: unknown) {
    return this.service.upsertMapping(mappingSchema.parse(body));
  }

  @Post('income/:id/accounting/prepare')
  @RequirePermission('finance', 'manage')
  prepare(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.prepare(id, user.sub);
  }

  @Post('income/:id/accounting/post')
  @RequirePermission('finance', 'manage')
  post(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.post(id, user.sub);
  }
}
