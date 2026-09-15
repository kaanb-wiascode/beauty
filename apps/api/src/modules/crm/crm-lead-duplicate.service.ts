import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type DbClient = Prisma.TransactionClient | PrismaService;
export interface DuplicateSignals { phone?:string|null; alternativePhone?:string|null; email?:string|null; providerContactId?:string|null; whatsappIdentity?:string|null; }
export interface LeadDuplicateCandidate { id:string; firstName:string; lastName:string; status:string; branchId:string; confidence:number; matchedSignals:string[]; updatedAt:Date; }

@Injectable()
export class CrmLeadDuplicateService {
 constructor(private readonly prisma:PrismaService,private readonly tenantContext:TenantContext){}
 private context(){return this.tenantContext.getContext();}

 async findCandidatesForLead(leadId:string,tx:DbClient=this.prisma){
  const c=this.context();
  const rows=await tx.$queryRawUnsafe<Array<{id:string;phone:string|null;alternativePhone:string|null;email:string|null;providerContactId:string|null;whatsappIdentity:string|null}>>(`SELECT id,phone,alternative_phone AS "alternativePhone",email,provider_contact_id AS "providerContactId",whatsapp_identity AS "whatsappIdentity" FROM crm_leads WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,leadId,c.tenantId,c.companyId,c.branchId??null);
  if(!rows[0])throw new NotFoundException('CRM lead not found in the active organization scope.');
  return this.findCandidates(rows[0],leadId,tx);
 }

 async findCandidates(signals:DuplicateSignals,excludeLeadId?:string,tx:DbClient=this.prisma):Promise<LeadDuplicateCandidate[]>{
  const c=this.context(),normalizedPhone=signals.phone?.replace(/\D/g,'')||null,normalizedAlternativePhone=signals.alternativePhone?.replace(/\D/g,'')||null,normalizedEmail=signals.email?.trim().toLowerCase()||null,providerContactId=signals.providerContactId?.trim()||null,whatsappIdentity=signals.whatsappIdentity?.replace(/\D/g,'')||signals.whatsappIdentity?.trim().toLowerCase()||null;
  if(!normalizedPhone&&!normalizedAlternativePhone&&!normalizedEmail&&!providerContactId&&!whatsappIdentity)return [];
  return tx.$queryRawUnsafe<LeadDuplicateCandidate[]>(`WITH candidates AS (SELECT l.id,l.first_name AS "firstName",l.last_name AS "lastName",l.status,l.branch_id AS "branchId",l.updated_at AS "updatedAt",ARRAY_REMOVE(ARRAY[CASE WHEN $5::text IS NOT NULL AND l.provider_contact_id=$5::text THEN 'PROVIDER_CONTACT_ID' END,CASE WHEN $6::text IS NOT NULL AND l.whatsapp_identity=$6::text THEN 'WHATSAPP_IDENTITY' END,CASE WHEN $3::text IS NOT NULL AND (l.normalized_phone=$3::text OR l.normalized_alternative_phone=$3::text) THEN 'PHONE' END,CASE WHEN $4::text IS NOT NULL AND l.normalized_email=$4::text THEN 'EMAIL' END,CASE WHEN $7::text IS NOT NULL AND (l.normalized_phone=$7::text OR l.normalized_alternative_phone=$7::text) THEN 'ALTERNATIVE_PHONE' END],NULL) AS "matchedSignals",LEAST(100,(CASE WHEN $5::text IS NOT NULL AND l.provider_contact_id=$5::text THEN 100 ELSE 0 END)+(CASE WHEN $6::text IS NOT NULL AND l.whatsapp_identity=$6::text THEN 95 ELSE 0 END)+(CASE WHEN $3::text IS NOT NULL AND (l.normalized_phone=$3::text OR l.normalized_alternative_phone=$3::text) THEN 90 ELSE 0 END)+(CASE WHEN $4::text IS NOT NULL AND l.normalized_email=$4::text THEN 85 ELSE 0 END)+(CASE WHEN $7::text IS NOT NULL AND (l.normalized_phone=$7::text OR l.normalized_alternative_phone=$7::text) THEN 80 ELSE 0 END))::int AS confidence FROM crm_leads l WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.merged_into_lead_id IS NULL AND ($8::text IS NULL OR l.id<>$8::text) AND (($5::text IS NOT NULL AND l.provider_contact_id=$5::text) OR ($6::text IS NOT NULL AND l.whatsapp_identity=$6::text) OR ($3::text IS NOT NULL AND (l.normalized_phone=$3::text OR l.normalized_alternative_phone=$3::text)) OR ($4::text IS NOT NULL AND l.normalized_email=$4::text) OR ($7::text IS NOT NULL AND (l.normalized_phone=$7::text OR l.normalized_alternative_phone=$7::text)))) SELECT id,"firstName","lastName",status,"branchId",confidence,"matchedSignals","updatedAt" FROM candidates ORDER BY confidence DESC,"updatedAt" DESC,id LIMIT 20`,c.tenantId,c.companyId,normalizedPhone,normalizedEmail,providerContactId,whatsappIdentity,normalizedAlternativePhone,excludeLeadId??null);
 }
}
