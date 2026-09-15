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
import { PlatformPrivilegedOperationsService } from './platform-privileged-operations.service';
import {
  getPlatformOperationContext,
  type PlatformRequestLike,
} from './platform-request-context';
import { PlatformReadModelService } from './platform-read-model.service';

type PlatformRequest = PlatformRequestLike & { user?: { sub?: string } };

@Controller('platform')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformControlPlaneController {
  constructor(
    private readonly readModel: PlatformReadModelService,
    private readonly iamRead: PlatformIamReadService,
    private readonly iamMutation: PlatformIamMutationService,
    private readonly auditRead: PlatformAuditReadService,
    private readonly privilegedOperations: PlatformPrivilegedOperationsService,
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

  @Get('privileged-operations')
  @RequirePlatformPermission('privileged_operations', 'read')
  listPrivilegedOperations(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.privilegedOperations.list({
      status,
      limit: this.parseOptionalInteger(limit),
      offset: this.parseOptionalInteger(offset),
    });
  }

  @Post('privileged-operations')
  @RequirePlatformPermission('privileged_operations', 'manage')
  createPrivilegedOperation(
    @Req() request: PlatformRequest,
    @Body()
    body: {
      resource?: string;
      action?: string;
      targetEntityType?: string | null;
      targetEntityId?: string | null;
      targetTenantId?: string | null;
      reason?: string;
      payload?: unknown;
    },
  ) {
    return this.privilegedOperations.create({
      actorUserId: this.actor(request),
      resource: body.resource ?? '',
      action: body.action ?? '',
      targetEntityType: body.targetEntityType,
      targetEntityId: body.targetEntityId,
      targetTenantId: body.targetTenantId,
      reason: body.reason ?? '',
      payload: body.payload,
      context: getPlatformOperationContext(request),
    });
  }

  @Post('privileged-operations/:requestId/decision')
  @RequirePlatformPermission('privileged_operations', 'manage')
  decidePrivilegedOperation(
    @Req() request: PlatformRequest,
    @Param('requestId') requestId: string,
    @Body() body: { decision?: 'APPROVED' | 'REJECTED'; reason?: string },
  ) {
    const decision = body.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new UnauthorizedException('A valid privileged operation decision is required.');
    }
    return this.privilegedOperations.decide({
      actorUserId: this.actor(request),
      requestId,
      decision,
      reason: body.reason ?? '',
      context: getPlatformOperationContext(request),
    });
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
