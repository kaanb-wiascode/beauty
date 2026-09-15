import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformGoLiveService } from './platform-go-live.service';
import { PlatformProvisioningCoordinatorService } from './platform-provisioning-coordinator.service';

type PlatformRequest = {
  user?: { sub?: string };
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('platform/provisioning')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformProvisioningController {
  constructor(
    private readonly provisioning: PlatformProvisioningCoordinatorService,
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
