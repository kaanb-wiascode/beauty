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
import {
  getPlatformOperationContext,
  type PlatformRequestLike,
} from './platform-request-context';
import { PlatformSupportSessionService } from './platform-support-session.service';

type PlatformRequest = PlatformRequestLike & { user?: { sub?: string } };

@Controller('platform/support-sessions')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformSupportSessionController {
  constructor(private readonly sessions: PlatformSupportSessionService) {}

  @Post('request')
  @RequirePlatformPermission('support_session', 'manage')
  requestSession(
    @Req() request: PlatformRequest,
    @Body()
    body: {
      tenantId?: string;
      supportTicketId?: string | null;
      accessMode?: string;
      scopes?: string[];
      durationMinutes?: number;
      reason?: string;
    },
  ) {
    return this.sessions.request(
      this.actor(request),
      body,
      getPlatformOperationContext(request),
    );
  }

  @Post('requests/:requestId/open')
  @RequirePlatformPermission('support_session', 'manage')
  openApproved(
    @Req() request: PlatformRequest,
    @Param('requestId') requestId: string,
  ) {
    return this.sessions.openApproved(
      requestId,
      this.actor(request),
      getPlatformOperationContext(request),
    );
  }

  @Get()
  @RequirePlatformPermission('support_session', 'read')
  list(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sessions.list({
      tenantId,
      status,
      limit: this.parseOptionalLimit(limit),
    });
  }

  @Get(':sessionId')
  @RequirePlatformPermission('support_session', 'read')
  get(@Param('sessionId') sessionId: string) {
    return this.sessions.get(sessionId);
  }

  @Post(':sessionId/revoke')
  @RequirePlatformPermission('support_session', 'manage')
  revoke(
    @Req() request: PlatformRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string },
  ) {
    return this.sessions.revoke(
      sessionId,
      this.actor(request),
      body.reason ?? '',
      getPlatformOperationContext(request).requestId,
    );
  }

  private parseOptionalLimit(value?: string) {
    if (value == null || value.trim() === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('limit must be an integer.');
    }
    return parsed;
  }

  private actor(request: PlatformRequest) {
    const actorUserId = request.user?.sub?.trim();
    if (!actorUserId) {
      throw new UnauthorizedException('Platform actor is required.');
    }
    return actorUserId;
  }
}
