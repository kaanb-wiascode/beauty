import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmUnresolvedInboundService } from './crm-unresolved-inbound.service';

const listSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED', 'ALL']).default('OPEN'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
const resolveSchema = z.object({
  subjectType: z.enum(['CUSTOMER', 'LEAD']),
  subjectId: z.string().uuid(),
  note: z.string().trim().max(1000).nullable().optional(),
});
const leadSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});
const dismissSchema = z.object({ reason: z.string().trim().min(1).max(1000) });

@Controller('crm/unresolved-inbound')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmUnresolvedInboundController {
  constructor(private readonly inbox: CrmUnresolvedInboundService) {}

  @Get()
  @RequirePermission('crm', 'read')
  list(@Query() query: unknown) {
    const input = listSchema.parse(query);
    return this.inbox.list(input.status, input.limit);
  }

  @Post(':id/resolve')
  @RequirePermission('crm', 'manage')
  resolve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const actor = this.actor(request);
    const input = resolveSchema.parse(body);
    return this.inbox.resolve(
      z.string().uuid().parse(id),
      input.subjectType,
      input.subjectId,
      input.note?.trim() || null,
      actor,
    );
  }

  @Post(':id/create-lead')
  @RequirePermission('crm', 'manage')
  createLead(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.inbox.createLead(z.string().uuid().parse(id), leadSchema.parse(body), this.actor(request));
  }

  @Post(':id/dismiss')
  @RequirePermission('crm', 'manage')
  dismiss(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const input = dismissSchema.parse(body);
    return this.inbox.dismiss(z.string().uuid().parse(id), input.reason, this.actor(request));
  }

  private actor(request: { user?: { sub?: string } }) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new Error('Authenticated user id is missing.');
    return actorUserId;
  }
}
