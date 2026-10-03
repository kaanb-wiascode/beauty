import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { upsertBrandGovernanceSchema } from './brand-governance.schemas';
import { BrandGovernanceService } from './brand-governance.service';

@Controller('corporate-communications/brand-governance')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('communications', 'read')
export class BrandGovernanceController {
  constructor(private readonly service: BrandGovernanceService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission('communications', 'manage')
  upsert(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.upsert(upsertBrandGovernanceSchema.parse(body), user.sub);
  }
}
