import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformAuditReadService } from './platform-audit-read.service';
import { PlatformIamReadService } from './platform-iam-read.service';
import { PlatformReadModelService } from './platform-read-model.service';

@Controller('platform')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformControlPlaneController {
  constructor(
    private readonly readModel: PlatformReadModelService,
    private readonly iamRead: PlatformIamReadService,
    private readonly auditRead: PlatformAuditReadService,
  ) {}

  @Get('command-center')
  @RequirePlatformPermission('command_center', 'read')
  getCommandCenter() {
    return this.readModel.getCommandCenter();
  }

  @Get('customers')
  @RequirePlatformPermission('customers', 'read')
  listCustomers(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.readModel.listTenants({
      search,
      limit: this.parseOptionalInteger(limit),
      offset: this.parseOptionalInteger(offset),
    });
  }

  @Get('customers/:tenantId')
  @RequirePlatformPermission('customers', 'read')
  getCustomer360(@Param('tenantId') tenantId: string) {
    return this.readModel.getTenant360(tenantId);
  }

  @Get('iam')
  @RequirePlatformPermission('platform_iam', 'read')
  getIamOverview() {
    return this.iamRead.getOverview();
  }

  @Get('audit')
  @RequirePlatformPermission('platform_audit', 'read')
  listAuditEvents(
    @Query('actorUserId') actorUserId?: string,
    @Query('resource') resource?: string,
    @Query('action') action?: string,
    @Query('targetTenantId') targetTenantId?: string,
    @Query('correlationId') correlationId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditRead.list({
      actorUserId,
      resource,
      action,
      targetTenantId,
      correlationId,
      limit: this.parseOptionalInteger(limit),
      offset: this.parseOptionalInteger(offset),
    });
  }

  private parseOptionalInteger(value?: string) {
    if (value === undefined || value.trim() === '') {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
}
