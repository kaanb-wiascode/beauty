import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmConversationAnalyticsService } from './crm-conversation-analytics.service';

@Controller('crm/conversation-analytics')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmConversationAnalyticsController {
  constructor(private readonly analytics: CrmConversationAnalyticsService) {}

  @Get('summary')
  @RequirePermission('crm', 'read')
  summary(@Req() request: { user?: { sub?: string } }) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new UnauthorizedException('Authenticated user id is missing.');
    return this.analytics.summary(actorUserId);
  }
}
