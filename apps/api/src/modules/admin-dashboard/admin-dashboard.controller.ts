import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get()
  @RequirePermission('roles', 'read')
  overview() {
    return this.service.overview();
  }
}
