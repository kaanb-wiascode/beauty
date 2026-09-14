import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmCommunicationComplianceService } from './crm-communication-compliance.service';

const subjectSchema = z.enum(['CUSTOMER', 'LEAD']);
const channelSchema = z.enum(['EMAIL', 'SMS', 'WHATSAPP']);
const updateSchema = z.object({
  status: z.enum(['OPTED_IN', 'OPTED_OUT', 'UNKNOWN']),
  source: z.enum(['MANUAL', 'IMPORT', 'INBOUND_KEYWORD', 'PROVIDER', 'SYSTEM']).default('MANUAL'),
  reason: z.string().trim().max(1000).nullable().optional(),
});

@Controller('crm/contact-permissions')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmCommunicationComplianceController {
  constructor(private readonly compliance: CrmCommunicationComplianceService) {}

  @Get(':subjectType/:subjectId')
  @RequirePermission('crm', 'read')
  list(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string) {
    return this.compliance.list(subjectSchema.parse(subjectType), z.string().uuid().parse(subjectId));
  }

  @Patch(':subjectType/:subjectId/:channel')
  @RequirePermission('crm', 'manage')
  update(
    @Param('subjectType') subjectType: string,
    @Param('subjectId') subjectId: string,
    @Param('channel') channel: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new Error('Authenticated user id is missing.');
    const input = updateSchema.parse(body);
    return this.compliance.set(
      subjectSchema.parse(subjectType),
      z.string().uuid().parse(subjectId),
      channelSchema.parse(channel),
      input.status,
      input.source,
      input.reason?.trim() || null,
      actorUserId,
    );
  }
}
