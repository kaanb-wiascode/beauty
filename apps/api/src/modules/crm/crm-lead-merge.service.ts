import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CrmLeadMergeService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  async merge(sourceLeadId:string,targetLeadId:string,actorUserId:string,reason:string,sourceVersion:number,targetVersion:number){
    if(sourceLeadId===targetLeadId) throw new BadRequestException('Source and target lead must be different.');
    const c=this.tenantContext.getContext();
    if(!c.branchId) throw new BadRequestException('Active branch is required for lead merge.');
    return this.prisma.$transaction(async tx=>{
      const leads=await tx.$queryRawUnsafe<Array<{id:string;version:number;mergedIntoLeadId:string|null}>>(
        `SELECT id,version,merged_into_lead_id AS "mergedIntoLeadId" FROM crm_leads
         WHERE id IN ($1::text,$2::text) AND tenant_id=$3::text AND company_id=$4::text AND branch_id=$5::text
         ORDER BY id FOR UPDATE`,sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);
      const source=leads.find(l=>l.id===sourceLeadId),target=leads.find(l=>l.id===targetLeadId);
      if(!source||!target) throw new NotFoundException('Source or target CRM lead was not found in the active organization scope.');
      if(source.version!==sourceVersion) throw new ConflictException('Source lead version changed before merge.');
      if(target.version!==targetVersion) throw new ConflictException('Target lead version changed before merge.');
      if(source.mergedIntoLeadId) throw new ConflictException('Source lead has already been merged.');
      if(target.mergedIntoLeadId) throw new ConflictException('Target lead has already been merged into another lead.');

      const opportunities=await tx.$queryRawUnsafe<Array<{leadId:string;id:string}>>(
        `SELECT id,lead_id AS "leadId" FROM crm_opportunities WHERE lead_id IN ($1::text,$2::text) AND tenant_id=$3::text AND company_id=$4::text AND branch_id=$5::text FOR UPDATE`,sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);
      const sourceOpportunity=opportunities.find(o=>o.leadId===sourceLeadId),targetOpportunity=opportunities.find(o=>o.leadId===targetLeadId);
      if(sourceOpportunity&&targetOpportunity) throw new ConflictException('Both leads have opportunities. Resolve the opportunity conflict before merging leads.');

      if(sourceOpportunity){
        await tx.$executeRawUnsafe(`UPDATE crm_opportunities SET lead_id=$2::text,version=version+1,updated_at=NOW() WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND branch_id=$5::text`,sourceOpportunity.id,targetLeadId,c.tenantId,c.companyId,c.branchId);
      }
      await tx.$executeRawUnsafe(`UPDATE crm_follow_ups SET lead_id=$2::text,version=version+1,updated_at=NOW() WHERE lead_id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND branch_id=$5::text`,sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);
      await tx.$executeRawUnsafe(`UPDATE crm_messages SET lead_id=$2::text,version=version+1,updated_at=NOW() WHERE lead_id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND branch_id=$5::text`,sourceLeadId,targetLeadId,c.tenantId,c.companyId,c.branchId);

      const updated=await tx.$queryRawUnsafe<Array<{id:string;mergedIntoLeadId:string;mergedAt:Date;version:number}>>(
        `UPDATE crm_leads SET merged_into_lead_id=$2::text,merged_at=NOW(),merged_by_user_id=$3::text,version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$4::text AND company_id=$5::text AND branch_id=$6::text AND merged_into_lead_id IS NULL AND version=$7::int
         RETURNING id,merged_into_lead_id AS "mergedIntoLeadId",merged_at AS "mergedAt",version`,sourceLeadId,targetLeadId,actorUserId,c.tenantId,c.companyId,c.branchId,sourceVersion);
      if(!updated[0]) throw new ConflictException('Source lead changed before merge could complete.');

      const targetRows=await tx.$queryRawUnsafe<Array<{id:string;version:number}>>(
        `UPDATE crm_leads SET version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text AND merged_into_lead_id IS NULL AND version=$5::int
         RETURNING id,version`,targetLeadId,c.tenantId,c.companyId,c.branchId,targetVersion);
      if(!targetRows[0]) throw new ConflictException('Target lead changed before merge could complete.');

      const metadata=JSON.stringify({sourceLeadId,targetLeadId,reason:reason.trim().slice(0,1000),movedOpportunityId:sourceOpportunity?.id??null,sourceVersionBefore:sourceVersion,targetVersionBefore:targetVersion});
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_MERGED_SOURCE',$6::text,$7::jsonb),
               ($1::text,$2::text,$3::text,$5::text,'LEAD_MERGED_TARGET',$6::text,$7::jsonb)`,
        c.tenantId,c.companyId,c.branchId,sourceLeadId,targetLeadId,actorUserId,metadata);
      return {...updated[0],targetLeadId,targetVersion:targetRows[0].version,movedOpportunityId:sourceOpportunity?.id??null};
    });
  }
}
