import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OrganizationAdminService } from './organization-admin.service';

@Controller('admin/organization')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('roles', 'read')
export class OrganizationAdminController {
  constructor(
    private readonly organizationAdmin: OrganizationAdminService,
  ) {}

  @Get('company')
  async company() {
    return this.organizationAdmin.currentCompany();
  }

  @Get('branches')
  async branches() {
    return this.organizationAdmin.accessibleBranches();
  }
}
