import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

@Injectable()
export class CrmInboundContactResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveIdentity(scope:{tenantId:string;companyId:string;branchId:string},identity:{providerContactId?:string|null;whatsappIdentity?:string|null;phone?:string|null}){
    const providerContactId=identity.providerContactId?.trim()||null;
    const whatsappRaw=identity.whatsappIdentity?.trim()||null;
    const whatsappIdentity=whatsappRaw ? (whatsappRaw.replace(/\D/g,'')||whatsappRaw.toLowerCase()) : null;
    if(providerContactId||whatsappIdentity){
      const rows=await this.prisma.$queryRawUnsafe<Array<{kind:string;id:string}>>(`SELECT 'LEAD' kind,l.id FROM crm_leads l WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text AND (($4::text IS NOT NULL AND l.provider_contact_id=$4::text) OR ($5::text IS NOT NULL AND l.whatsapp_identity=$5::text)) LIMIT 3`,scope.tenantId,scope.companyId,scope.branchId,providerContactId,whatsappIdentity);
      if(rows.length===1)return {matched:true as const,customerId:null,leadId:rows[0].id};
      if(rows.length>1)return {matched:false as const,reason:'AMBIGUOUS' as const};
    }
    if(identity.phone)return this.resolvePhone(scope,identity.phone);
    return {matched:false as const,reason:'NOT_FOUND' as const};
  }

  async resolvePhone(scope: { tenantId: string; companyId: string; branchId: string }, rawPhone: string) {
    const raw = rawPhone.replace(/\D/g, '');
    const phone = raw.startsWith('00') ? raw.slice(2) : raw;
    if (phone.length < 8) return { matched: false as const, reason: 'INVALID_PHONE' as const };
    const rows = await this.prisma.$queryRawUnsafe<Array<{ kind: string; id: string }>>(
      `SELECT 'CUSTOMER' kind,c.id FROM customers c
       WHERE c."tenantId"=$1::text AND c."branchId"=$3::text
         AND regexp_replace(COALESCE(c.phone,''),'[^0-9]','','g')=$4
       UNION ALL
       SELECT 'LEAD' kind,l.id FROM crm_leads l
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text
         AND (l.normalized_phone=$4 OR l.normalized_alternative_phone=$4 OR l.whatsapp_identity=$4)
       LIMIT 3`,scope.tenantId,scope.companyId,scope.branchId,phone);
    if (!rows.length) return { matched: false as const, reason: 'NOT_FOUND' as const };
    if (rows.length !== 1) return { matched: false as const, reason: 'AMBIGUOUS' as const };
    return rows[0].kind === 'CUSTOMER'
      ? { matched: true as const, customerId: rows[0].id, leadId: null }
      : { matched: true as const, customerId: null, leadId: rows[0].id };
  }
}
