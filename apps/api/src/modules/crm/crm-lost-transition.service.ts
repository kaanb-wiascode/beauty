import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmLostReasonService } from './crm-lost-reason.service';

@Injectable()
export class CrmLostTransitionService {
  constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext,private readonly reasons:CrmLostReasonService){}

  async loseLead(id:string,input:{version:number;lostReasonId:string;lostReasonNote?:string|null},actorUserId:string){
    await this.reasons.assertUsable(input.lostReasonId); const c=this.tenantContext.getContext();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(`UPDATE crm_leads SET status='LOST',lost_reason_id=$5::text,lost_reason_note=$6::text,lost_reason=NULL,version=version+1,updated_at=NOW() WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text AND version=$7::int AND merged_into_lead_id IS NULL RETURNING id,status,lost_reason_id AS "lostReasonId",lost_reason_note AS "lostReasonNote",version`,id,c.tenantId,c.companyId,c.branchId,input.lostReasonId,input.lostReasonNote??null,input.version);
      if(!rows[0]){const exists=await tx.$queryRawUnsafe<any[]>(`SELECT id FROM crm_leads WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text`,id,c.tenantId,c.companyId,c.branchId);if(!exists[0])throw new NotFoundException('CRM lead not found.');throw new ConflictException('Lead changed before lost transition.');}
      await tx.$executeRawUnsafe(`INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_LOST',$5::text,$6::jsonb)`,c.tenantId,c.companyId,c.branchId,id,actorUserId,JSON.stringify({lostReasonId:input.lostReasonId,hasNote:Boolean(input.lostReasonNote)})); return rows[0];
    });
  }

  async loseOpportunity(id:string,input:{version:number;lostReasonId:string;lostReasonNote?:string|null},actorUserId:string){
    await this.reasons.assertUsable(input.lostReasonId); const c=this.tenantContext.getContext();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(`UPDATE crm_opportunities SET stage='LOST',probability=0,lost_reason_id=$5::text,lost_reason_note=$6::text,lost_reason=NULL,version=version+1,updated_at=NOW() WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text AND version=$7::int RETURNING id,stage,probability,lost_reason_id AS "lostReasonId",lost_reason_note AS "lostReasonNote",version,lead_id AS "leadId"`,id,c.tenantId,c.companyId,c.branchId,input.lostReasonId,input.lostReasonNote??null,input.version);
      if(!rows[0]){const exists=await tx.$queryRawUnsafe<any[]>(`SELECT id FROM crm_opportunities WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text`,id,c.tenantId,c.companyId,c.branchId);if(!exists[0])throw new NotFoundException('CRM opportunity not found.');throw new ConflictException('Opportunity changed before lost transition.');}
      await tx.$executeRawUnsafe(`INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,opportunity_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'OPPORTUNITY_LOST',$6::text,$7::jsonb)`,c.tenantId,c.companyId,c.branchId,rows[0].leadId,id,actorUserId,JSON.stringify({lostReasonId:input.lostReasonId,hasNote:Boolean(input.lostReasonNote)})); return rows[0];
    });
  }
}
