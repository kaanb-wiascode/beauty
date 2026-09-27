import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmAssignmentService } from './crm-assignment.service';

const createRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  mode: z.enum(['MANUAL','ROUND_ROBIN','LOAD_BALANCED','BRANCH_BASED','SKILL_BASED']),
  teamId: z.string().uuid().nullable().optional(),
  sourceFilter: z.string().trim().min(1).max(60).nullable().optional(),
  skillKey: z.string().trim().min(1).max(120).nullable().optional(),
  priority: z.coerce.number().int().min(1).max(10000).default(100),
});

@Controller('crm/assignment-rules')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmAssignmentController {
  constructor(private readonly assignments: CrmAssignmentService) {}

  @Get()
  @RequirePermission('crm', 'read')
  list() {
    return this.assignments.listRules();
  }

  @Post()
  @RequirePermission('crm', 'manage')
  create(@Body() body: unknown) {
    return this.assignments.createRule(createRuleSchema.parse(body));
  }
}
