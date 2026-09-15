import { Body, Controller, Get, Param, Patch, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmConversationOperationsService } from './crm-conversation-operations.service';

const subjectTypeSchema = z.enum(['CUSTOMER','LEAD','OPPORTUNITY']);
const assignmentSchema = z.object({ assignedUserId: z.string().uuid().nullable(), version: z.coerce.number().int().min(0).optional() });
const policySchema = z.object({
  version: z.coerce.number().int().min(0).optional(),
  whatsappTargetMinutes: z.coerce.number().int().min(5).max(10080),
  smsTargetMinutes: z.coerce.number().int().min(5).max(10080),
  emailTargetMinutes: z.coerce.number().int().min(5).max(10080),
  criticalAfterMinutes: z.coerce.number().int().min(30).max(43200),
});
const stateSchema = z.object({
  status: z.enum(['OPEN','SNOOZED','CLOSED']),
  snoozedUntil: z.coerce.date().nullable().optional(),
  version: z.coerce.number().int().min(0).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'SNOOZED' && !value.snoozedUntil) ctx.addIssue({ code: 'custom', message: 'snoozedUntil is required for SNOOZED.' });
  if (value.status !== 'SNOOZED' && value.snoozedUntil) ctx.addIssue({ code: 'custom', message: 'snoozedUntil is only valid for SNOOZED.' });
});

@Controller('crm/conversation-operations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmConversationOperationsController {
  constructor(private readonly operations: CrmConversationOperationsService) {}

  @Get('sla-policy') @RequirePermission('crm','read') policy() { return this.operations.policy(); }

  @Patch('sla-policy') @RequirePermission('crm','manage')
  savePolicy(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.operations.savePolicy(policySchema.parse(body), this.actor(request));
  }

  @Get('assignments/:subjectType/:subjectId') @RequirePermission('crm','read')
  assignment(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string) {
    return this.operations.assignment(subjectTypeSchema.parse(subjectType), subjectId);
  }

  @Patch('assignments/:subjectType/:subjectId') @RequirePermission('crm','manage')
  setAssignment(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string,
    @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    const input = assignmentSchema.parse(body);
    return this.operations.setAssignment(subjectTypeSchema.parse(subjectType), subjectId,
      input.assignedUserId, input.version, this.actor(request));
  }

  @Get('states/:subjectType/:subjectId') @RequirePermission('crm','read')
  state(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string) {
    return this.operations.state(subjectTypeSchema.parse(subjectType), subjectId);
  }

  @Patch('states/:subjectType/:subjectId') @RequirePermission('crm','manage')
  setState(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string,
    @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    const input = stateSchema.parse(body);
    return this.operations.setState(subjectTypeSchema.parse(subjectType), subjectId, input.status,
      input.snoozedUntil ?? null, input.version, this.actor(request));
  }

  private actor(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }
}
