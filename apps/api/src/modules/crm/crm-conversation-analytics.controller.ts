import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmConversationAnalyticsService } from './crm-conversation-analytics.service';

const limitSchema = z.coerce.number().int().min(1).max(200).optional();
const severitySchema = z.enum(['ALL', 'BREACHED', 'CRITICAL']).default('BREACHED');

@Controller('crm/conversation-analytics')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmConversationAnalyticsController {
  constructor(private readonly analytics: CrmConversationAnalyticsService) {}

  @Get('summary')
  @RequirePermission('crm', 'read')
  summary(@Req() request: { user?: { sub?: string } }) {
    return this.analytics.summary(this.actor(request));
  }

  @Get('breaches')
  @RequirePermission('crm', 'read')
  breaches(
    @Req() request: { user?: { sub?: string } },
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.breaches(this.actor(request), severitySchema.parse(severity ?? 'BREACHED'), limitSchema.parse(limit));
  }

  private actor(request: { user?: { sub?: string } }) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new UnauthorizedException('Authenticated user id is missing.');
    return actorUserId;
  }
}
