import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ApprovalWorkflowService } from './approval-workflow.service';

const stepSchema = z.object({
  key: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  approverPermission: z.string().trim().min(3).max(120).optional(),
  approverRoleSlug: z.string().trim().min(1).max(80).optional(),
  mode: z.enum(['SEQUENTIAL', 'PARALLEL']).default('SEQUENTIAL'),
}).passthrough();

const createSchema = z.object({
  workflowKey: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(120),
  domain: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  conditions: z.record(z.string(), z.unknown()).default({}),
  steps: z.array(stepSchema).min(1).max(20),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(stepSchema).min(1).max(20).optional(),
});

@Controller('admin/approval-workflows')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class ApprovalWorkflowController {
  constructor(private readonly service: ApprovalWorkflowService) {}

  @Get()
  @RequirePermission('roles', 'read')
  list(@Query('domain') domain?: string) {
    return this.service.list(domain?.trim() || undefined);
  }

  @Post()
  @RequirePermission('roles', 'update')
  create(@Body() body: unknown) {
    return this.service.create(createSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermission('roles', 'update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.service.updateDraft(id, updateSchema.parse(body));
  }

  @Post(':id/publish')
  @RequirePermission('roles', 'update')
  publish(@Param('id') id: string) {
    return this.service.publish(id);
  }
}
