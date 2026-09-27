import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  cancelFollowUpSchema,
  completeFollowUpSchema,
  createFollowUpSchema,
  createLeadSchema,
  createOpportunitySchema,
  leadStatusSchema,
  opportunityStageSchema,
  qualifyLeadSchema,
  rescheduleFollowUpSchema,
  transitionOpportunitySchema,
  updateLeadSchema,
} from './crm.schemas';
import { CrmDataScopeService } from './crm-data-scope.service';
import { CrmLeadService } from './crm-lead.service';
import { CrmOperationsService } from './crm-operations.service';
import { CrmOpportunityService } from './crm-opportunity.service';
import { CrmService } from './crm.service';

const uuid = z.string().uuid();
const crmDataScopeSchema = z.object({ dataScope: z.enum(['SELF','TEAM','BRANCH','COMPANY','ALL']) });
const surveyorProfileSchema = z.object({ active: z.boolean(), dailyDeskQuota: z.coerce.number().int().min(0).nullable().optional(), weeklyDeskQuota: z.coerce.number().int().min(0).nullable().optional() });
const listLeadsSchema = z.object({
  status: leadStatusSchema.optional(),
  ownerUserId: uuid.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const listOpportunitiesSchema = z.object({
  stage: opportunityStageSchema.optional(),
  ownerUserId: uuid.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  updatedBefore: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const listFollowUpsSchema = z.object({
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
  assignedUserId: uuid.optional(),
  dueBefore: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const operationsSummarySchema = z
  .object({
    dayStart: z.coerce.date(),
    dayEnd: z.coerce.date(),
  })
  .refine((value) => value.dayEnd > value.dayStart, {
    message: 'Bitiş zamanı başlangıç zamanından sonra olmalıdır.',
    path: ['dayEnd'],
  });

@Controller('crm')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly dataScope: CrmDataScopeService,
    private readonly leads: CrmLeadService,
    private readonly opportunities: CrmOpportunityService,
    private readonly operations: CrmOperationsService,
  ) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Oturum açmış kullanıcı bilgisi bulunamadı.');
    return id;
  }

  @Get('operations-summary')
  @RequirePermission('crm', 'read')
  getOperationsSummary(@Query() query: unknown) {
    const filters = operationsSummarySchema.parse(query);
    return this.operations.getSummary(filters.dayStart, filters.dayEnd);
  }

  @Get('data-scope')
  @RequirePermission('crm', 'read')
  getDataScope() {
    return this.dataScope.resolve();
  }

  @Get('access-policies')
  @RequirePermission('crm', 'manage')
  listAccessPolicies() {
    return this.dataScope.listAccessPolicies();
  }

  @Patch('access-policies/:roleId')
  @RequirePermission('crm', 'manage')
  updateAccessPolicy(@Param('roleId') roleId: string, @Body() body: unknown) {
    const input = crmDataScopeSchema.parse(body);
    return this.dataScope.setAccessPolicy(uuid.parse(roleId), input.dataScope);
  }

  @Get('surveyors')
  @RequirePermission('crm', 'read')
  listSurveyors() {
    return this.dataScope.listSurveyors();
  }

  @Get('surveyor-candidates')
  @RequirePermission('crm', 'manage')
  listSurveyorCandidates() {
    return this.dataScope.listSurveyorCandidates();
  }

  @Patch('surveyors/:staffId')
  @RequirePermission('crm', 'manage')
  updateSurveyorProfile(@Param('staffId') staffId: string, @Body() body: unknown) {
    return this.dataScope.upsertSurveyorProfile(
      uuid.parse(staffId),
      surveyorProfileSchema.parse(body),
    );
  }

  @Get('assignees')
  @RequirePermission('crm', 'read')
  listAssignees() {
    return this.crm.listAssignees();
  }

  @Get('leads')
  @RequirePermission('crm', 'read')
  listLeads(@Query() query: unknown) {
    return this.leads.list(listLeadsSchema.parse(query));
  }

  @Get('leads/:id')
  @RequirePermission('crm', 'read')
  getLead(@Param('id') id: string) {
    return this.leads.get(uuid.parse(id));
  }

  @Post('leads')
  @RequirePermission('crm', 'manage')
  createLead(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.leads.create(createLeadSchema.parse(body), this.userId(request));
  }

  @Patch('leads/:id')
  @RequirePermission('crm', 'manage')
  updateLead(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.leads.update(uuid.parse(id), updateLeadSchema.parse(body), this.userId(request));
  }

  @Post('leads/:id/qualify')
  @RequirePermission('crm', 'manage')
  qualifyLead(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.crm.qualifyLead(uuid.parse(id), qualifyLeadSchema.parse(body), this.userId(request));
  }

  @Get('opportunities')
  @RequirePermission('crm', 'read')
  listOpportunities(@Query() query: unknown) {
    return this.opportunities.list(listOpportunitiesSchema.parse(query));
  }

  @Get('opportunities/:id')
  @RequirePermission('crm', 'read')
  getOpportunity(@Param('id') id: string) {
    return this.opportunities.getDetail(uuid.parse(id));
  }

  @Post('opportunities')
  @RequirePermission('crm', 'manage')
  createOpportunity(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.opportunities.createFromCustomer(createOpportunitySchema.parse(body), this.userId(request));
  }

  @Post('opportunities/:id/transition')
  @RequirePermission('crm', 'manage')
  transitionOpportunity(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.crm.transitionOpportunity(uuid.parse(id), transitionOpportunitySchema.parse(body), this.userId(request));
  }

  @Get('follow-ups')
  @RequirePermission('crm', 'read')
  listFollowUps(@Query() query: unknown) {
    return this.crm.listFollowUps(listFollowUpsSchema.parse(query));
  }

  @Post('follow-ups')
  @RequirePermission('crm', 'manage')
  createFollowUp(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.crm.createFollowUp(createFollowUpSchema.parse(body), this.userId(request));
  }

  @Post('follow-ups/:id/complete')
  @RequirePermission('crm', 'manage')
  completeFollowUp(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.crm.completeFollowUp(uuid.parse(id), completeFollowUpSchema.parse(body), this.userId(request));
  }

  @Post('follow-ups/:id/reschedule')
  @RequirePermission('crm', 'manage')
  rescheduleFollowUp(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.crm.rescheduleFollowUp(uuid.parse(id), rescheduleFollowUpSchema.parse(body), this.userId(request));
  }

  @Post('follow-ups/:id/cancel')
  @RequirePermission('crm', 'manage')
  cancelFollowUp(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.crm.cancelFollowUp(uuid.parse(id), cancelFollowUpSchema.parse(body), this.userId(request));
  }
}
