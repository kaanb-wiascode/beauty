import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ApprovalDelegationService } from './approval-delegation.service';
import { ApprovalRuntimeService } from './approval-runtime.service';
import { ApprovalWorkflowService } from './approval-workflow.service';

const stepSchema = z.object({
  key: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  approverPermission: z.string().trim().min(3).max(120).optional(),
  approverRoleSlug: z.string().trim().min(1).max(80).optional(),
  mode: z.enum(['SEQUENTIAL', 'PARALLEL']).default('SEQUENTIAL'),
}).passthrough();
const createSchema = z.object({workflowKey:z.string().trim().min(2).max(100),name:z.string().trim().min(2).max(120),domain:z.string().trim().min(2).max(80),description:z.string().trim().max(500).optional(),conditions:z.record(z.string(),z.unknown()).default({}),steps:z.array(stepSchema).min(1).max(20)});
const updateSchema = z.object({name:z.string().trim().min(2).max(120).optional(),description:z.string().trim().max(500).nullable().optional(),conditions:z.record(z.string(),z.unknown()).optional(),steps:z.array(stepSchema).min(1).max(20).optional()});
const requestSchema=z.object({workflowKey:z.string().trim().min(2).max(100),entityType:z.string().trim().min(1).max(100),entityId:z.string().trim().min(1).max(200),branchId:z.string().uuid().nullable().optional(),payload:z.record(z.string(),z.unknown()).optional(),reason:z.string().trim().max(500).optional()});
const actSchema=z.object({decision:z.enum(['APPROVE','REJECT']),comment:z.string().trim().max(500).optional()});
const delegationSchema=z.object({delegatorUserId:z.string().uuid(),delegateUserId:z.string().uuid(),domain:z.string().trim().min(2).max(80).nullable().optional(),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),reason:z.string().trim().min(3).max(500)});

@Controller('admin/approval-workflows')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class ApprovalWorkflowController {
  constructor(private readonly service:ApprovalWorkflowService,private readonly runtime:ApprovalRuntimeService,private readonly delegations:ApprovalDelegationService){}
  @Get() @RequirePermission('roles','read') list(@Query('domain') domain?:string){return this.service.list(domain?.trim()||undefined)}
  @Post() @RequirePermission('roles','update') create(@Body() body:unknown){return this.service.create(createSchema.parse(body))}
  @Patch(':id') @RequirePermission('roles','update') update(@Param('id') id:string,@Body() body:unknown){return this.service.updateDraft(id,updateSchema.parse(body))}
  @Post(':id/publish') @RequirePermission('roles','update') publish(@Param('id') id:string){return this.service.publish(id)}
  @Get('runtime/requests') @RequirePermission('roles','read') requests(@Query('status') status?:string){return this.runtime.list(status?.trim()||undefined)}
  @Post('runtime/requests') @RequirePermission('roles','update') createRequest(@Body() body:unknown){return this.runtime.create(requestSchema.parse(body))}
  @Post('runtime/requests/:id/act') @RequirePermission('roles','update') act(@Param('id') id:string,@Body() body:unknown){const x=actSchema.parse(body);return this.runtime.act(id,x.decision,x.comment)}
  @Get('runtime/delegations') @RequirePermission('roles','read') delegationList(){return this.delegations.list()}
  @Post('runtime/delegations') @RequirePermission('roles','update') createDelegation(@Body() body:unknown){return this.delegations.create(delegationSchema.parse(body))}
  @Post('runtime/delegations/:id/revoke') @RequirePermission('roles','update') revokeDelegation(@Param('id') id:string){return this.delegations.revoke(id)}
}
