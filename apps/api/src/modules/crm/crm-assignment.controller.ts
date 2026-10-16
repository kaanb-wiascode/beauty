import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmAssignmentService } from './crm-assignment.service';

const uuid = z.string().uuid();

const updateRuleSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  mode: z.enum(['MANUAL','ROUND_ROBIN','LOAD_BALANCED','BRANCH_BASED','SKILL_BASED']).optional(),
  teamId: z.string().uuid().nullable().optional(),
  sourceFilter: z.string().trim().min(1).max(60).nullable().optional(),
  skillKey: z.string().trim().min(1).max(120).nullable().optional(),
  priority: z.coerce.number().int().min(1).max(10000).optional(),
  active: z.boolean().optional(),
});

const createRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  mode: z.enum(['MANUAL','ROUND_ROBIN','LOAD_BALANCED','BRANCH_BASED','SKILL_BASED']),
  teamId: z.string().uuid().nullable().optional(),
  sourceFilter: z.string().trim().min(1).max(60).nullable().optional(),
  skillKey: z.string().trim().min(1).max(120).nullable().optional(),
  priority: z.coerce.number().int().min(1).max(10000).default(100),
}).refine(
  (value) => value.mode !== 'SKILL_BASED' || Boolean(value.skillKey),
  { message: 'Yetkinliğe göre dağıtım için yetkinlik anahtarı gereklidir.', path: ['skillKey'] },
);

@Controller('crm/assignment-rules')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmAssignmentController {
  constructor(private readonly assignments: CrmAssignmentService) {}

  @Get()
  @RequirePermission('crm', 'read')
  list() {
    return this.assignments.listRules();
  }

  @Get('history/:leadId')
  @RequirePermission('crm', 'read')
  history(@Param('leadId') leadId: string) {
    return this.assignments.listHistory(uuid.parse(leadId));
  }

  @Patch(':id')
  @RequirePermission('crm', 'manage')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.assignments.updateRule(uuid.parse(id), updateRuleSchema.parse(body));
  }

  @Post()
  @RequirePermission('crm', 'manage')
  create(@Body() body: unknown) {
    return this.assignments.createRule(createRuleSchema.parse(body));
  }
}
