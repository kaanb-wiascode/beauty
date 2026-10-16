import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type DbClient = Prisma.TransactionClient | PrismaService;
type IdentityInput = {
  providerContactId?: string | null;
  whatsappIdentity?: string | null;
};

export interface LeadExternalIdentities {
  providerContactId: string | null;
  whatsappIdentity: string | null;
}

@Injectable()
export class CrmLeadIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  hasChanges(input: IdentityInput) {
    return input.providerContactId !== undefined || input.whatsappIdentity !== undefined;
  }

  async get(leadId: string, tx: DbClient = this.prisma): Promise<LeadExternalIdentities> {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe<Array<LeadExternalIdentities>>(
      'SELECT provider_contact_id AS "providerContactId",whatsapp_identity AS "whatsappIdentity" FROM crm_leads WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND ($4::text IS NULL OR branch_id=$4) LIMIT 1',
      leadId,
      c.tenantId,
      c.companyId,
      c.branchId,
    );
    if (!rows[0]) throw new NotFoundException('CRM lead not found.');
    return rows[0];
  }

  async persist(
    leadId: string,
    input: IdentityInput,
    expectedVersion?: number,
  ): Promise<LeadExternalIdentities> {
    const c = this.context();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<LeadExternalIdentities & { version: number }>>(
        'SELECT provider_contact_id AS "providerContactId",whatsapp_identity AS "whatsappIdentity",version FROM crm_leads WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND ($4::text IS NULL OR branch_id=$4) FOR UPDATE',
        leadId,
        c.tenantId,
        c.companyId,
        c.branchId,
      );
      if (!rows[0]) throw new NotFoundException('CRM lead not found.');
      if (expectedVersion !== undefined && rows[0].version !== expectedVersion) {
        throw new ConflictException('Lead changed before provider identities could be updated.');
      }

      const provider = input.providerContactId === undefined
        ? rows[0].providerContactId
        : input.providerContactId;
      const whatsapp = input.whatsappIdentity === undefined
        ? rows[0].whatsappIdentity
        : input.whatsappIdentity;
      const updated = await tx.$queryRawUnsafe<Array<LeadExternalIdentities>>(
        'UPDATE crm_leads SET provider_contact_id=$5,whatsapp_identity=$6,updated_at=NOW() WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND ($4::text IS NULL OR branch_id=$4) RETURNING provider_contact_id AS "providerContactId",whatsapp_identity AS "whatsappIdentity"',
        leadId,
        c.tenantId,
        c.companyId,
        c.branchId,
        provider,
        whatsapp,
      );
      return updated[0];
    });
  }
}
