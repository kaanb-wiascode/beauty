import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { cancelFollowUpSchema,completeFollowUpSchema,createFollowUpSchema,createLeadSchema,createOpportunitySchema,duplicateCandidateSchema,leadStatusSchema,mergeLeadSchema,opportunityStageSchema,qualifyLeadSchema,rescheduleFollowUpSchema,transitionOpportunitySchema,updateLeadSchema } from './crm.schemas';
import { CrmAcquisitionService } from './crm-acquisition.service';
import { CrmLeadDuplicateService } from './crm-lead-duplicate.service';
import { CrmLeadIdentityService } from './crm-lead-identity.service';
import { CrmLeadMergeService } from './crm-lead-merge.service';
import { CrmLeadService } from './crm-lead.service';
import { CrmOperationsService } from './crm-operations.service';
import { CrmOpportunityService } from './crm-opportunity.service';
import { CrmService } from './crm.service';
const uuid=z.string().uuid();
const listLeadsSchema=z.object({status:leadStatusSchema.optional(),ownerUserId:uuid.optional(),search:z.string().trim().min(1).max(200).optional(),limit:z.coerce.number().int().min(1).max(200).optional()});
const listOpportunitiesSchema=z.object({stage:opportunityStageSchema.optional(),ownerUserId:uuid.optional(),search:z.string().trim().min(1).max(200).optional(),updatedBefore:z.coerce.date().optional(),limit:z.coerce.number().int().min(1).max(200).optional()});
const listFollowUpsSchema=z.object({status:z.enum(['OPEN','COMPLETED','CANCELLED']).optional(),assignedUserId:uuid.optional(),dueBefore:z.coerce.date().optional(),limit:z.coerce.number().int().min(1).max(200).optional()});
const operationsSummarySchema=z.object({dayStart:z.coerce.date(),dayEnd:z.coerce.date()}).refine(v=>v.dayEnd>v.dayStart,{message:'dayEnd must be after dayStart.',path:['dayEnd']});
@Controller('crm') @UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class CrmController{
 constructor(private readonly crm:CrmService,private readonly leads:CrmLeadService,private readonly duplicates:CrmLeadDuplicateService,private readonly identities:CrmLeadIdentityService,private readonly mergeService:CrmLeadMergeService,private readonly acquisition:CrmAcquisitionService,private readonly opportunities:CrmOpportunityService,private readonly operations:CrmOperationsService){}
 private userId(r:{user?:{sub?:string}}){const id=r.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
 @Get('operations-summary') @RequirePermission('crm','read') getOperationsSummary(@Query() q:unknown){const f=operationsSummarySchema.parse(q);return this.operations.getSummary(f.dayStart,f.dayEnd);}
 @Get('assignees') @RequirePermission('crm','read') listAssignees(){return this.crm.listAssignees();}
 @Get('leads') @RequirePermission('crm','read') listLeads(@Query() q:unknown){return this.leads.list(listLeadsSchema.parse(q));}
 @Post('leads/duplicate-candidates') @RequirePermission('crm','read') findDuplicateCandidates(@Body() b:unknown){const i=duplicateCandidateSchema.parse(b);return this.duplicates.findCandidates(i,i.excludeLeadId);}
 @Post('leads/:id/merge') @RequirePermission('crm','manage') mergeLead(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){const sourceLeadId=uuid.parse(id),i=mergeLeadSchema.parse(b);return this.mergeService.merge(sourceLeadId,i.targetLeadId,this.userId(r),i.reason,i.sourceVersion,i.targetVersion);}
 @Get('leads/:id') @RequirePermission('crm','read') async getLead(@Param('id') id:string){const leadId=uuid.parse(id);const [lead,refs,identities]=await Promise.all([this.leads.get(leadId),this.acquisition.getLeadRefs(leadId),this.identities.get(leadId)]);return {...lead,...refs,...identities};}
 @Post('leads') @RequirePermission('crm','manage') async createLead(@Body() b:unknown,@Req() r:{user?:{sub?:string}}){const i=createLeadSchema.parse(b),hasRefs=this.acquisition.hasRefChanges(i),hasIdentities=this.identities.hasChanges(i);if(hasRefs)await this.acquisition.resolveRefs(i);const duplicateCandidates=await this.duplicates.findCandidates(i);const lead=await this.leads.create(i,this.userId(r));const refs=hasRefs?await this.acquisition.persistLeadRefs(lead.id,i):{};const identities=hasIdentities?await this.identities.persist(lead.id,i):{};return {...lead,...refs,...identities,duplicateCandidates};}
 @Patch('leads/:id') @RequirePermission('crm','manage') async updateLead(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){const leadId=uuid.parse(id),i=updateLeadSchema.parse(b),hasRefs=this.acquisition.hasRefChanges(i),hasIdentities=this.identities.hasChanges(i);if(hasRefs){const cur=await this.acquisition.getLeadRefs(leadId);await this.acquisition.resolveRefs({acquisitionChannelId:i.acquisitionChannelId===undefined?cur.acquisitionChannelId:i.acquisitionChannelId,acquisitionSourceId:i.acquisitionSourceId===undefined?cur.acquisitionSourceId:i.acquisitionSourceId,acquisitionCampaignRefId:i.acquisitionCampaignRefId===undefined?cur.acquisitionCampaignRefId:i.acquisitionCampaignRefId,acquisitionAdSetRefId:i.acquisitionAdSetRefId===undefined?cur.acquisitionAdSetRefId:i.acquisitionAdSetRefId,acquisitionAdRefId:i.acquisitionAdRefId===undefined?cur.acquisitionAdRefId:i.acquisitionAdRefId});}const lead=await this.leads.update(leadId,i,this.userId(r));const refs=hasRefs?await this.acquisition.persistLeadRefs(leadId,i,Number(lead.version)):{};const identities=hasIdentities?await this.identities.persist(leadId,i,Number(lead.version)):{};const fullIdentities=hasIdentities?identities:await this.identities.get(leadId);const duplicateCandidates=await this.duplicates.findCandidates({phone:i.phone,email:i.email,alternativePhone:i.alternativePhone,providerContactId:fullIdentities.providerContactId,whatsappIdentity:fullIdentities.whatsappIdentity},leadId);return {...lead,...refs,...identities,duplicateCandidates};}
 @Post('leads/:id/qualify') @RequirePermission('crm','manage') qualifyLead(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.crm.qualifyLead(uuid.parse(id),qualifyLeadSchema.parse(b),this.userId(r));}
 @Get('opportunities') @RequirePermission('crm','read') listOpportunities(@Query() q:unknown){return this.opportunities.list(listOpportunitiesSchema.parse(q));}
 @Get('opportunities/:id') @RequirePermission('crm','read') getOpportunity(@Param('id') id:string){return this.opportunities.getDetail(uuid.parse(id));}
 @Post('opportunities') @RequirePermission('crm','manage') createOpportunity(@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.opportunities.createFromCustomer(createOpportunitySchema.parse(b),this.userId(r));}
 @Post('opportunities/:id/transition') @RequirePermission('crm','manage') transitionOpportunity(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.crm.transitionOpportunity(uuid.parse(id),transitionOpportunitySchema.parse(b),this.userId(r));}
 @Get('follow-ups') @RequirePermission('crm','read') listFollowUps(@Query() q:unknown){return this.crm.listFollowUps(listFollowUpsSchema.parse(q));}
 @Post('follow-ups') @RequirePermission('crm','manage') createFollowUp(@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.crm.createFollowUp(createFollowUpSchema.parse(b),this.userId(r));}
 @Post('follow-ups/:id/complete') @RequirePermission('crm','manage') completeFollowUp(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.crm.completeFollowUp(uuid.parse(id),completeFollowUpSchema.parse(b),this.userId(r));}
 @Post('follow-ups/:id/reschedule') @RequirePermission('crm','manage') rescheduleFollowUp(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.crm.rescheduleFollowUp(uuid.parse(id),rescheduleFollowUpSchema.parse(b),this.userId(r));}
 @Post('follow-ups/:id/cancel') @RequirePermission('crm','manage') cancelFollowUp(@Param('id') id:string,@Body() b:unknown,@Req() r:{user?:{sub?:string}}){return this.crm.cancelFollowUp(uuid.parse(id),cancelFollowUpSchema.parse(b),this.userId(r));}
}
