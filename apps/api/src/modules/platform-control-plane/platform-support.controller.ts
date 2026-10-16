import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { PlatformJwtAuthGuard } from '../../common/auth/platform-jwt-auth.guard';
import { RequirePlatformPermission } from '../../common/auth/platform-permissions.decorator';
import { PlatformPermissionsGuard } from '../../common/auth/platform-permissions.guard';
import { PlatformSupportService } from './platform-support.service';

type PlatformRequest = {
  user?: { sub?: string };
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('platform/support')
@UseGuards(PlatformJwtAuthGuard, PlatformPermissionsGuard)
export class PlatformSupportController {
  constructor(private readonly support: PlatformSupportService) {}

  @Get('tickets')
  @RequirePlatformPermission('support', 'read')
  listTickets(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('limit') limit?: string,
  ) {
    return this.support.listTickets({
      tenantId,
      status,
      priority,
      limit: this.parseOptionalLimit(limit),
    });
  }

  @Get('summary')
  @RequirePlatformPermission('support', 'read')
  summary() {
    return this.support.summary();
  }

  @Post('tickets')
  @RequirePlatformPermission('support', 'manage')
  createTicket(
    @Req() request: PlatformRequest,
    @Body()
    body: {
      tenantId?: string;
      subject?: string;
      description?: string | null;
      priority?: string;
      source?: string;
      requesterEmail?: string | null;
      assignedPlatformUserId?: string | null;
    },
  ) {
    return this.support.createTicket(
      this.actor(request),
      body,
      this.correlationId(request),
    );
  }

  @Get('tickets/:ticketId')
  @RequirePlatformPermission('support', 'read')
  getTicket(@Param('ticketId') ticketId: string) {
    return this.support.getTicket(ticketId);
  }

  @Patch('tickets/:ticketId')
  @RequirePlatformPermission('support', 'manage')
  updateTicket(
    @Req() request: PlatformRequest,
    @Param('ticketId') ticketId: string,
    @Body()
    body: {
      status?: string;
      priority?: string;
      assignedPlatformUserId?: string | null;
      note?: string | null;
      reason?: string;
    },
  ) {
    return this.support.updateTicket(
      ticketId,
      this.actor(request),
      body,
      body.reason ?? '',
      this.correlationId(request),
    );
  }

  @Post('tickets/:ticketId/respond')
  @RequirePlatformPermission('support', 'manage')
  respond(
    @Req() request: PlatformRequest,
    @Param('ticketId') ticketId: string,
    @Body() body: { note?: string },
  ) {
    return this.support.respond(
      ticketId,
      this.actor(request),
      body.note ?? '',
      this.correlationId(request),
    );
  }

  @Get('sla/policies')
  @RequirePlatformPermission('sla', 'read')
  listPolicies() {
    return this.support.listPolicies();
  }

  @Post('sla/policies')
  @RequirePlatformPermission('sla', 'manage')
  replacePolicy(
    @Req() request: PlatformRequest,
    @Body()
    body: {
      priority?: string;
      name?: string;
      initialResponseMinutes?: number;
      resolutionMinutes?: number;
      reason?: string;
    },
  ) {
    return this.support.replacePolicy(
      this.actor(request),
      body,
      body.reason ?? '',
      this.correlationId(request),
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

  private correlationId(request: PlatformRequest) {
    const value = request.headers?.['x-request-id'];
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }
}
