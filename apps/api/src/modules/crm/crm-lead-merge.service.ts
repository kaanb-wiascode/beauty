import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
@Injectable() export class CrmLeadMergeService{
 constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext){}
 async merge(sourceLeadId:string,targetLeadId:string,actorUserId:string,reason:string,sourceVersion:number,targetVersion:number){
  if(sourceLeadId===targetLeadId)throw new BadRequestException('Source and target lead must be different.');
  const c=this.tenantContext.getContext();if(!c.branchId)throw new BadRequestException('Active branch is required for lead merge.');
  return this.prisma.$transaction(async tx=>{
   const leads=await tx.$queryRawUnsafe<Array<{id:string;version:number;mergedIntoLeadId:string|null}>>('SELECT id,version,merged_into_lead_id AS "mergedIntoLeadId" FROM crm_leads WHERE id IN ($1,$2) AND tenant_id=$3 AND company_id=$4 AND branch_id=$5 ORDER BY id FOR UPDATE',sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);
   const source=leads.find(x=>x.id===sourceLeadId),target=leads.find(x=>x.id===targetLeadId);if(!source||!target)throw new NotFoundException('Source or target CRM lead was not found.');if(source.version!==sourceVersion||target.version!==targetVersion)throw new ConflictException('Lead version changed before merge.');if(source.mergedIntoLeadId||target.mergedIntoLeadId)throw new ConflictException('A selected lead has already been merged.');
   const opportunities=await tx.$queryRawUnsafe<Array<{id:string;leadId:string}>>('SELECT id,lead_id AS "leadId" FROM crm_opportunities WHERE lead_id IN ($1,$2) AND tenant_id=$3 AND company_id=$4 AND branch_id=$5 FOR UPDATE',sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);const so=opportunities.find(x=>x.leadId===sourceLeadId),to=opportunities.find(x=>x.leadId===targetLeadId);if(so&&to)throw new ConflictException('Both leads have opportunities. Resolve the opportunity conflict before merging leads.');
   if(so)await tx.$executeRawUnsafe('UPDATE crm_opportunities SET lead_id=$2,version=version+1,updated_at=NOW() WHERE id=$1 AND tenant_id=$3 AND company_id=$4 AND branch_id=$5',so.id,targetLeadId,c.tenantId,c.companyId,c.branchId);
   await tx.$executeRawUnsafe('UPDATE crm_follow_ups SET lead_id=$2,version=version+1,updated_at=NOW() WHERE lead_id=$1 AND tenant_id=$3 AND company_id=$4 AND branch_id=$5',sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);
   await tx.$executeRawUnsafe('UPDATE crm_messages SET lead_id=$2,version=version+1,updated_at=NOW() WHERE lead_id=$1 AND tenant_id=$3 AND company_id=$4 AND branch_id=$5',sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);
   const merged=await tx.$queryRawUnsafe<Array<{id:string;version:number}>>('UPDATE crm_leads SET merged_into_lead_id=$2,merged_at=NOW(),merged_by_user_id=$3,version=version+1,updated_at=NOW() WHERE id=$1 AND tenant_id=$4 AND company_id=$5 AND branch_id=$6 AND merged_into_lead_id IS NULL AND version=$7 RETURNING id,version',sourceLeadId,targetLeadId,actorUserId,c.tenantId,c.companyId,c.branchId,sourceVersion);if(!merged[0])throw new ConflictException('Source lead changed before merge could complete.');
   const survivor=await tx.$queryRawUnsafe<Array<{id:string;version:number}>>('UPDATE crm_leads SET version=version+1,updated_at=NOW() WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4 AND merged_into_lead_id IS NULL AND version=$5 RETURNING id,version',targetLeadId,c.tenantId,c.companyId,c.branchId,targetVersion);if(!survivor[0])throw new ConflictException('Target lead changed before merge could complete.');
   return{sourceLeadId,targetLeadId,sourceVersion:merged[0].version,targetVersion:survivor[0].version,movedOpportunityId:so?.id??null,reason:reason.trim().slice(0,1000)};
  });
 }
}
