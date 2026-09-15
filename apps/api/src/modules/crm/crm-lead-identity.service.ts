import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateLeadInput, UpdateLeadInput } from './crm.schemas';

type DbClient = Prisma.TransactionClient | PrismaService;
type IdentityInput = Pick<CreateLeadInput, 'providerContactId' | 'whatsappIdentity'> | Pick<UpdateLeadInput, 'providerContactId' | 'whatsappIdentity'>;
export interface LeadExternalIdentities { providerContactId: string | null; whatsappIdentity: string | null; }

@Injectable()
export class CrmLeadIdentityService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}
  private context() { return this.tenantContext.getContext(); }
  hasChanges(input: IdentityInput) { return input.providerContactId !== undefined || input.whatsappIdentity !== undefined; }
  async get(leadId: string, tx: DbClient = this.prisma): Promise<LeadExternalIdentities> {
    const c=this.context();
    const rows=await tx.$queryRawUnsafe<Array<LeadExternalIdentities>>(`SELECT provider_contact_id AS "providerContactId",whatsapp_identity AS "whatsappIdentity" FROM crm_leads WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,leadId,c.tenantId,c.companyId,c.branchId);
    if(!rows.length) throw new NotFoundException('CRM lead not found.');
    return rows[0];
  }
  async persist(leadId:string,input:IdentityInput,expectedVersion?:number):Promise<LeadExternalIdentities>{
    const c=this.context();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<Array<LeadExternalIdentities & {version:number}>>(`SELECT provider_contact_id AS "providerContactId",whatsapp_identity AS "whatsappIdentity",version FROM crm_leads WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) FOR UPDATE`,leadId,c.tenantId,c.companyId,c.branchId);
      if(!rows.length) throw new NotFoundException('CRM lead not found.');
      if(expectedVersion!==undefined && rows[0].version!==expectedVersion) throw new ConflictException('Lead changed before provider identities could be updated.');
      const providerContactId=input.providerContactId===undefined?rows[0].providerContactId:input.providerContactId;
      const whatsappIdentity=input.whatsappIdentity===undefined?rows[0].whatsappIdentity:input.whatsappIdentity;
      const updated=await tx.$queryRawUnsafe<Array<LeadExternalIdentities>>(`UPDATE crm_leads SET provider_contact_id=$5::text,whatsapp_identity=$6::text,updated_at=NOW() WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) RETURNING provider_contact_id AS "providerContactId",whatsapp_identity AS "whatsappIdentity"`,leadId,c.tenantId,c.companyId,c.branchId,providerContactId,whatsappIdentity);
      return updated[0];
    });
  }
}
