import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { IntegrationAdminService } from './integration-admin.service';

@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class IntegrationAdminController {
  constructor(private readonly service: IntegrationAdminService) {}

  @Get()
  @RequirePermission('finance', 'read')
  catalog() {
    return this.service.catalog();
  }
}
