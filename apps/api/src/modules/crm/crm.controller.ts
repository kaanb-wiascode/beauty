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
import { CrmAcquisitionService } from './crm-acquisition.service';
import { CrmLeadService } from './crm-lead.service';
import { CrmOperationsService } from './crm-operations.service';
import { CrmOpportunityService } from './crm-opportunity.service';
import { CrmService } from './crm.service';

const uuid = z.string().uuid();
const listLeadsSchema = z.object({
  status: leadStatusSchema.optional(), ownerUserId: uuid.optional(), search: z.string().trim().min(1).max(200).optional(), limit: z.coerce.number().int().min(1).max(200).optional(),
});
const listOpportunitiesSchema = z.object({
  stage: opportunityStageSchema.optional(), ownerUserId: uuid.optional(), search: z.string().trim().min(1).max(200).optional(), updatedBefore: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(200).optional(),
});
const listFollowUpsSchema = z.object({
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(), assignedUserId: uuid.optional(), dueBefore: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(200).optional(),
});
const operationsSummarySchema = z.object({ dayStart: z.coerce.date(), dayEnd: z.coerce.date() }).refine((value) => value.dayEnd > value.dayStart, { message: 'dayEnd must be after dayStart.', path: ['dayEnd'] });

@Controller('crm')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly leads: CrmLeadService,
    private readonly acquisition: CrmAcquisitionService,
    private readonly opportunities: CrmOpportunityService,
    private readonly operations: CrmOperationsService,
  ) {}

  private userId(request: { user?: { sub?: string } }) { const id=request.user?.sub; if(!id) throw new UnauthorizedException('Authenticated user id is missing.'); return id; }

  @Get('operations-summary') @RequirePermission('crm', 'read')
  getOperationsSummary(@Query() query: unknown) { const filters=operationsSummarySchema.parse(query); return this.operations.getSummary(filters.dayStart,filters.dayEnd); }

  @Get('assignees') @RequirePermission('crm', 'read')
  listAssignees() { return this.crm.listAssignees(); }

  @Get('leads') @RequirePermission('crm', 'read')
  listLeads(@Query() query: unknown) { return this.leads.list(listLeadsSchema.parse(query)); }

  @Get('leads/:id') @RequirePermission('crm', 'read')
  async getLead(@Param('id') id: string) {
    const leadId=uuid.parse(id);
    const [lead,acquisitionRefs]=await Promise.all([this.leads.get(leadId),this.acquisition.getLeadRefs(leadId)]);
    return {...lead,...acquisitionRefs};
  }

  @Post('leads') @RequirePermission('crm', 'manage')
  async createLead(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    const input=createLeadSchema.parse(body);
    const hasRefs=this.acquisition.hasRefChanges(input);
    if(hasRefs) await this.acquisition.resolveRefs(input);
    const lead=await this.leads.create(input,this.userId(request));
    if(!hasRefs) return lead;
    const refs=await this.acquisition.persistLeadRefs(lead.id,input);
    return {...lead,...refs};
  }

  @Patch('leads/:id') @RequirePermission('crm', 'manage')
  async updateLead(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    const leadId=uuid.parse(id),input=updateLeadSchema.parse(body),hasRefs=this.acquisition.hasRefChanges(input);
    if(hasRefs){
      const current=await this.acquisition.getLeadRefs(leadId);
      await this.acquisition.resolveRefs({
        acquisitionChannelId:input.acquisitionChannelId===undefined?current.acquisitionChannelId:input.acquisitionChannelId,
        acquisitionSourceId:input.acquisitionSourceId===undefined?current.acquisitionSourceId:input.acquisitionSourceId,
        acquisitionCampaignRefId:input.acquisitionCampaignRefId===undefined?current.acquisitionCampaignRefId:input.acquisitionCampaignRefId,
        acquisitionAdSetRefId:input.acquisitionAdSetRefId===undefined?current.acquisitionAdSetRefId:input.acquisitionAdSetRefId,
        acquisitionAdRefId:input.acquisitionAdRefId===undefined?current.acquisitionAdRefId:input.acquisitionAdRefId,
      });
    }
    const lead=await this.leads.update(leadId,input,this.userId(request));
    if(!hasRefs) return lead;
    const refs=await this.acquisition.persistLeadRefs(leadId,input,Number(lead.version));
    return {...lead,...refs};
  }

  @Post('leads/:id/qualify') @RequirePermission('crm', 'manage')
  qualifyLead(@Param('id') id: string,@Body() body: unknown,@Req() request:{user?:{sub?:string}}){return this.crm.qualifyLead(uuid.parse(id),qualifyLeadSchema.parse(body),this.userId(request));}

  @Get('opportunities') @RequirePermission('crm', 'read')
  listOpportunities(@Query() query: unknown){return this.opportunities.list(listOpportunitiesSchema.parse(query));}
  @Get('opportunities/:id') @RequirePermission('crm', 'read')
  getOpportunity(@Param('id') id:string){return this.opportunities.getDetail(uuid.parse(id));}
  @Post('opportunities') @RequirePermission('crm', 'manage')
  createOpportunity(@Body() body:unknown,@Req() request:{user?:{sub?:string}}){return this.opportunities.createFromCustomer(createOpportunitySchema.parse(body),this.userId(request));}
  @Post('opportunities/:id/transition') @RequirePermission('crm', 'manage')
  transitionOpportunity(@Param('id') id:string,@Body() body:unknown,@Req() request:{user?:{sub?:string}}){return this.crm.transitionOpportunity(uuid.parse(id),transitionOpportunitySchema.parse(body),this.userId(request));}

  @Get('follow-ups') @RequirePermission('crm', 'read')
  listFollowUps(@Query() query:unknown){return this.crm.listFollowUps(listFollowUpsSchema.parse(query));}
  @Post('follow-ups') @RequirePermission('crm', 'manage')
  createFollowUp(@Body() body:unknown,@Req() request:{user?:{sub?:string}}){return this.crm.createFollowUp(createFollowUpSchema.parse(body),this.userId(request));}
  @Post('follow-ups/:id/complete') @RequirePermission('crm', 'manage')
  completeFollowUp(@Param('id') id:string,@Body() body:unknown,@Req() request:{user?:{sub?:string}}){return this.crm.completeFollowUp(uuid.parse(id),completeFollowUpSchema.parse(body),this.userId(request));}
  @Post('follow-ups/:id/reschedule') @RequirePermission('crm', 'manage')
  rescheduleFollowUp(@Param('id') id:string,@Body() body:unknown,@Req() request:{user?:{sub?:string}}){return this.crm.rescheduleFollowUp(uuid.parse(id),rescheduleFollowUpSchema.parse(body),this.userId(request));}
  @Post('follow-ups/:id/cancel') @RequirePermission('crm', 'manage')
  cancelFollowUp(@Param('id') id:string,@Body() body:unknown,@Req() request:{user?:{sub?:string}}){return this.crm.cancelFollowUp(uuid.parse(id),cancelFollowUpSchema.parse(body),this.userId(request));}
}
