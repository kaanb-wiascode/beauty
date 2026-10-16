import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { AdministrationGovernanceService } from './administration-governance.service';

const sodSchema = z.object({
  domain: z.string().trim().min(2).max(80),
  requesterCannotApprove: z.boolean().default(true),
  requireDistinctApprovers: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const privacyPolicySchema = z.object({
  dataCategory: z.string().trim().min(2).max(100),
  retentionDays: z.number().int().positive().max(36500).nullable().optional(),
  legalBasisReference: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  enabled: z.boolean().default(true),
});

const privacyRequestSchema = z.object({
  requestType: z.enum(['EXPORT','ANONYMIZATION','DELETION_REVIEW']),
  subjectType: z.string().trim().min(2).max(100),
  subjectId: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(1000).optional(),
});

const reviewSchema = z.object({
  status: z.enum(['IN_REVIEW','APPROVED','REJECTED','COMPLETED','CANCELLED']),
  resolutionNote: z.string().trim().max(2000).optional(),
});

@Controller('admin/governance')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class AdministrationGovernanceController {
  constructor(private readonly service: AdministrationGovernanceService) {}

  @Get('sod')
  @RequirePermission('roles','read')
  sodPolicies() { return this.service.listSodPolicies(); }

  @Put('sod')
  @RequirePermission('roles','update')
  upsertSod(@Body() body: unknown) { return this.service.upsertSodPolicy(sodSchema.parse(body)); }

  @Get('privacy/policies')
  @RequirePermission('roles','read')
  privacyPolicies() { return this.service.listPrivacyPolicies(); }

  @Put('privacy/policies')
  @RequirePermission('roles','update')
  upsertPrivacyPolicy(@Body() body: unknown) { return this.service.upsertPrivacyPolicy(privacyPolicySchema.parse(body)); }

  @Get('privacy/requests')
  @RequirePermission('roles','read')
  privacyRequests(@Query('status') status?: string) { return this.service.listPrivacyRequests(status?.trim() || undefined); }

  @Post('privacy/requests')
  @RequirePermission('roles','update')
  createPrivacyRequest(@Body() body: unknown) { return this.service.createPrivacyRequest(privacyRequestSchema.parse(body)); }

  @Post('privacy/requests/:id/review')
  @RequirePermission('roles','update')
  reviewPrivacyRequest(@Param('id') id: string, @Body() body: unknown) { return this.service.reviewPrivacyRequest(id, reviewSchema.parse(body)); }
}
