import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TenantEntitlementsService } from './tenant-entitlements.service';

@Controller('admin/entitlements')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TenantEntitlementsController {
  constructor(private readonly entitlements: TenantEntitlementsService) {}

  @Get()
  @RequirePermission('roles', 'read')
  effective() {
    return this.entitlements.effective();
  }
}
