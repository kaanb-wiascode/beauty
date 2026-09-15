import {
  BadRequestException,
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
import { PlatformGoLiveService } from './platform-go-live.service';
import { PlatformOwnerInvitationDispatcherService } from './platform-owner-invitation-dispatcher.service';
import { PlatformOwnerInvitationService } from './platform-owner-invitation.service';
import { PlatformProvisioningCoordinatorService } from './platform-provisioning-coordinator.service';
import { PlatformProvisioningOperationsService } from './platform-provisioning-operations.service';

type PlatformRequest = {
  user?: { sub?: string };
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('platform/provisioning')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformProvisioningController {
  constructor(
    private readonly provisioning: PlatformProvisioningCoordinatorService,
    private readonly operations: PlatformProvisioningOperationsService,
    private readonly ownerInvitation: PlatformOwnerInvitationService,
    private readonly ownerInvitationDispatcher: PlatformOwnerInvitationDispatcherService,
    private readonly goLive: PlatformGoLiveService,
  ) {}

  @Post()
  @RequirePlatformPermission('provisioning', 'manage')
  start(
    @Req() request: PlatformRequest,
    @Body()
    body: {
      idempotencyKey?: string;
      tenantName?: string;
      tenantSlug?: string;
      planVersionId?: string;
      companyName?: string;
      companySlug?: string;
      primaryBranchName?: string;
      primaryBranchCode?: string;
      sourceType?: 'MANUAL' | 'OPPORTUNITY';
      sourceId?: string;
      ownerEmail?: string;
      reason?: string;
    },
  ) {
    return this.provisioning.start(
      body,
      this.actor(request),
      body.reason ?? '',
      this.correlationId(request),
    );
  }

  @Get()
  @RequirePlatformPermission('provisioning', 'read')
  list(
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.operations.list({
      status,
      sourceType,
      tenantId,
      limit: limit == null || limit.trim() === '' ? undefined : Number(limit),
    });
  }

  @Get('summary')
  @RequirePlatformPermission('provisioning', 'read')
  summary() {
    return this.operations.summary();
  }

  @Get(':runId')
  @RequirePlatformPermission('provisioning', 'read')
  get(@Param('runId') runId: string) {
    return this.provisioning.get(runId);
  }

  @Post(':runId/resume')
  @RequirePlatformPermission('provisioning', 'manage')
  resume(
    @Req() request: PlatformRequest,
    @Param('runId') runId: string,
    @Body() body: { reason?: string },
  ) {
    return this.provisioning.resume(
      runId,
      this.actor(request),
      body.reason ?? '',
      this.correlationId(request),
    );
  }

  @Post(':runId/owner-invitation')
  @RequirePlatformPermission('provisioning', 'manage')
  queueOwnerInvitation(
    @Req() request: PlatformRequest,
    @Param('runId') runId: string,
    @Body() body: { ownerEmail?: string; reason?: string },
  ) {
    return this.ownerInvitation.bindAndQueue(
      runId,
      body.ownerEmail ?? '',
      this.actor(request),
      {
        reason: body.reason ?? null,
        correlationId: this.correlationId(request),
      },
    );
  }

  @Post(':runId/owner-invitation/dispatch')
  @RequirePlatformPermission('provisioning', 'manage')
  dispatchOwnerInvitation(
    @Req() request: PlatformRequest,
    @Param('runId') runId: string,
    @Body() body: { reason?: string },
  ) {
    const reason = body.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Owner invitation dispatch requires a reason.');
    }
    return this.ownerInvitationDispatcher.dispatch(
      runId,
      this.actor(request),
      reason,
      this.correlationId(request),
    );
  }

  @Post(':runId/go-live')
  @RequirePlatformPermission('provisioning', 'manage')
  activateGoLive(
    @Req() request: PlatformRequest,
    @Param('runId') runId: string,
    @Body() body: { reason?: string },
  ) {
    return this.goLive.execute(
      runId,
      this.actor(request),
      body.reason ?? '',
      this.correlationId(request),
    );
  }

  private actor(request: PlatformRequest) {
    const actorUserId = request.user?.sub?.trim();
    if (!actorUserId) {
      throw new UnauthorizedException('Platform actor is required.');
    }
    return actorUserId;
  }

  private correlationId(request: PlatformRequest) {
    const value = request.headers?.['x-request-id'];
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }
}
