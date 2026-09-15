import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmLeadSlaService } from './crm-lead-sla.service';

const updateLeadSlaPolicySchema = z.object({
  warningMinutes: z.coerce.number().int().min(1).max(1440),
  breachMinutes: z.coerce.number().int().min(2).max(4320),
  ownerEscalationMinutes: z.coerce.number().int().min(1).max(4320),
  managerEscalationMinutes: z.coerce.number().int().min(2).max(10080),
  reassignmentEscalationMinutes: z.coerce.number().int().min(3).max(20160),
  version: z.coerce.number().int().min(0),
}).strict()
  .refine((value) => value.warningMinutes < value.breachMinutes, {
    message: 'warningMinutes must be lower than breachMinutes.',
    path: ['breachMinutes'],
  })
  .refine((value) => value.ownerEscalationMinutes < value.managerEscalationMinutes, {
    message: 'ownerEscalationMinutes must be lower than managerEscalationMinutes.',
    path: ['managerEscalationMinutes'],
  })
  .refine((value) => value.managerEscalationMinutes < value.reassignmentEscalationMinutes, {
    message: 'managerEscalationMinutes must be lower than reassignmentEscalationMinutes.',
    path: ['reassignmentEscalationMinutes'],
  });

@Controller('crm/lead-sla')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmLeadSlaController {
  constructor(private readonly sla: CrmLeadSlaService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('policy')
  @RequirePermission('crm', 'read')
  getPolicy() {
    return this.sla.getPolicy();
  }

  @Patch('policy')
  @RequirePermission('crm', 'manage')
  updatePolicy(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.sla.updatePolicy(updateLeadSlaPolicySchema.parse(body), this.userId(request));
  }

  @Get('dashboard')
  @RequirePermission('crm', 'read')
  dashboard() {
    return this.sla.dashboard();
  }

  @Post('process-escalations')
  @RequirePermission('crm', 'manage')
  processEscalations() {
    return this.sla.processCurrentScope();
  }
}
