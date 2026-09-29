import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { FinancialPeriodService } from './financial-period.service';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});
const closeSchema = z.object({ reason: z.string().trim().max(500).optional() });

@Controller('finance/periods')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class FinancialPeriodController {
  constructor(private readonly service: FinancialPeriodService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission('accounting', 'manage')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.create(createSchema.parse(body), user.sub);
  }

  @Post(':id/close')
  @RequirePermission('accounting', 'manage')
  close(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.close(id, user.sub, closeSchema.parse(body).reason);
  }

  @Post(':id/reopen')
  @RequirePermission('accounting', 'manage')
  reopen(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.reopen(id, user.sub);
  }
}
