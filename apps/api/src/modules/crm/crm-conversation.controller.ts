import { Controller, Get, Param, Patch, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmConversationService } from './crm-conversation.service';

const typeSchema = z.enum(['CUSTOMER','LEAD','OPPORTUNITY']);
const limitSchema = z.coerce.number().int().min(1).max(300).optional();
const modeSchema = z.enum(['ALL','MINE','UNASSIGNED']).default('ALL');
const statusSchema = z.enum(['ACTIVE','OPEN','PENDING','RESOLVED','SNOOZED','CLOSED']).default('ACTIVE');
const prioritySchema = z.enum(['ALL','LOW','NORMAL','HIGH','URGENT']).default('ALL');
const channelSchema = z.enum(['ALL','EMAIL','SMS','WHATSAPP']).default('ALL');

@Controller('crm/conversations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmConversationController {
  constructor(private readonly conversations: CrmConversationService) {}

  @Get()
  @RequirePermission('crm','read')
  list(
    @Req() request: { user?: { sub?: string } },
    @Query('limit') limit?: string,
    @Query('mode') mode?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('channel') channel?: string,
  ) {
    return this.conversations.list(
      this.actor(request),
      limitSchema.parse(limit),
      modeSchema.parse(mode ?? 'ALL'),
      statusSchema.parse(status ?? 'ACTIVE'),
      prioritySchema.parse(priority ?? 'ALL'),
      channelSchema.parse(channel ?? 'ALL'),
    );
  }

  @Get(':subjectType/:subjectId')
  @RequirePermission('crm','read')
  detail(
    @Req() request: { user?: { sub?: string } },
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversations.detail(typeSchema.parse(subjectType), subjectId, this.actor(request), limitSchema.parse(limit));
  }

  @Patch(':subjectType/:subjectId/read')
  @RequirePermission('crm','read')
  markRead(
    @Req() request: { user?: { sub?: string } },
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
  ) {
    return this.conversations.markRead(typeSchema.parse(subjectType), subjectId, this.actor(request));
  }

  private actor(request: { user?: { sub?: string } }) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new UnauthorizedException('Authenticated user id is missing.');
    return actorUserId;
  }
}
