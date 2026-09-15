import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformAuditReadService } from './platform-audit-read.service';
import { PlatformIamMutationService } from './platform-iam-mutation.service';
import { PlatformIamReadService } from './platform-iam-read.service';
import { PlatformReadModelService } from './platform-read-model.service';

type PlatformRequest = { user?: { sub?: string } };

@Controller('platform')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformControlPlaneController {
  constructor(
    private readonly readModel: PlatformReadModelService,
    private readonly iamRead: PlatformIamReadService,
    private readonly iamMutation: PlatformIamMutationService,
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

  @Post('iam/admins')
  @RequirePlatformPermission('platform_iam', 'manage')
  provisionAdmin(
    @Req() request: PlatformRequest,
    @Body() body: { userId?: string; roleSlug?: string; reason?: string },
  ) {
    return this.iamMutation.provisionAdmin(
      { actorUserId: this.actor(request), reason: body.reason ?? '' },
      { userId: body.userId ?? '', roleSlug: body.roleSlug },
    );
  }

  @Post('iam/admins/:userId/status')
  @RequirePlatformPermission('platform_iam', 'manage')
  setAdminStatus(
    @Req() request: PlatformRequest,
    @Param('userId') userId: string,
    @Body() body: { status?: string; reason?: string },
  ) {
    return this.iamMutation.setAdminStatus(
      { actorUserId: this.actor(request), reason: body.reason ?? '' },
      { userId, status: body.status ?? '' },
    );
  }

  @Post('iam/admins/:userId/roles')
  @RequirePlatformPermission('platform_iam', 'manage')
  assignRole(
    @Req() request: PlatformRequest,
    @Param('userId') userId: string,
    @Body() body: { roleSlug?: string; reason?: string },
  ) {
    return this.iamMutation.assignRole(
      { actorUserId: this.actor(request), reason: body.reason ?? '' },
      { userId, roleSlug: body.roleSlug ?? '' },
    );
  }

  @Post('iam/admins/:userId/roles/:roleSlug/remove')
  @RequirePlatformPermission('platform_iam', 'manage')
  removeRole(
    @Req() request: PlatformRequest,
    @Param('userId') userId: string,
    @Param('roleSlug') roleSlug: string,
    @Body() body: { reason?: string },
  ) {
    return this.iamMutation.removeRole(
      { actorUserId: this.actor(request), reason: body.reason ?? '' },
      { userId, roleSlug },
    );
  }

  @Post('iam/roles/:roleSlug/permissions')
  @RequirePlatformPermission('platform_iam', 'manage')
  grantRolePermission(
    @Req() request: PlatformRequest,
    @Param('roleSlug') roleSlug: string,
    @Body() body: { resource?: string; action?: string; reason?: string },
  ) {
    return this.iamMutation.grantRolePermission(
      { actorUserId: this.actor(request), reason: body.reason ?? '' },
      { roleSlug, resource: body.resource ?? '', action: body.action ?? '' },
    );
  }

  @Post('iam/roles/:roleSlug/permissions/revoke')
  @RequirePlatformPermission('platform_iam', 'manage')
  revokeRolePermission(
    @Req() request: PlatformRequest,
    @Param('roleSlug') roleSlug: string,
    @Body() body: { resource?: string; action?: string; reason?: string },
  ) {
    return this.iamMutation.revokeRolePermission(
      { actorUserId: this.actor(request), reason: body.reason ?? '' },
      { roleSlug, resource: body.resource ?? '', action: body.action ?? '' },
    );
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

  private actor(request: PlatformRequest) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated platform actor is missing.');
    }
    return actorUserId;
  }

  private parseOptionalInteger(value?: string) {
    if (value === undefined || value.trim() === '') {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
}
