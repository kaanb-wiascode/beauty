import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface DuplicateSignals {
  phone?: string | null;
  alternativePhone?: string | null;
  email?: string | null;
  providerKey?: string | null;
  providerContactId?: string | null;
  whatsappIdentity?: string | null;
}

export interface LeadDuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  branchId: string;
  confidence: number;
  matchedSignals: string[];
  updatedAt: Date;
}

@Injectable()
export class CrmLeadDuplicateService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  async findCandidatesForLead(leadId: string): Promise<LeadDuplicateCandidate[]> {
    const c = this.tenantContext.getContext();
    const source = await this.prisma.$queryRawUnsafe<Array<DuplicateSignals & { id: string }>>(
      'SELECT id, phone, alternative_phone AS "alternativePhone", email, provider_contact_provider_key AS "providerKey", provider_contact_id AS "providerContactId", whatsapp_identity AS "whatsappIdentity" FROM crm_leads WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND ($4::text IS NULL OR branch_id=$4) LIMIT 1',
      leadId, c.tenantId, c.companyId, c.branchId ?? null,
    );
    if (!source[0]) throw new NotFoundException('CRM lead not found in the active organization scope.');
    return this.findCandidates(source[0], leadId);
  }

  async findCandidates(signals: DuplicateSignals, excludeLeadId?: string): Promise<LeadDuplicateCandidate[]> {
    const c = this.tenantContext.getContext();
    const phone = signals.phone?.replace(/\D/g, '') || null;
    const alt = signals.alternativePhone?.replace(/\D/g, '') || null;
    const email = signals.email?.trim().toLowerCase() || null;
    const providerKey = signals.providerKey?.trim().toLowerCase() || null;
    const providerContactId = signals.providerContactId?.trim() || null;
    const whatsapp = signals.whatsappIdentity?.replace(/\D/g, '') || null;
    if (!phone && !alt && !email && !(providerKey && providerContactId) && !whatsapp) return [];
    return this.prisma.$queryRawUnsafe<LeadDuplicateCandidate[]>(
      'SELECT id, first_name AS "firstName", last_name AS "lastName", status, branch_id AS "branchId", updated_at AS "updatedAt", CASE WHEN $4 IS NOT NULL AND $5 IS NOT NULL AND provider_contact_provider_key=$4 AND provider_contact_id=$5 THEN 100 WHEN $6 IS NOT NULL AND whatsapp_identity=$6 THEN 95 WHEN $2 IS NOT NULL AND (normalized_phone=$2 OR normalized_alternative_phone=$2) THEN 90 WHEN $3 IS NOT NULL AND normalized_email=$3 THEN 85 ELSE 80 END AS confidence, ARRAY[]::text[] AS "matchedSignals" FROM crm_leads WHERE tenant_id=$7 AND company_id=$8 AND merged_into_lead_id IS NULL AND ($9::text IS NULL OR id<>$9) AND (($4 IS NOT NULL AND $5 IS NOT NULL AND provider_contact_provider_key=$4 AND provider_contact_id=$5) OR ($6 IS NOT NULL AND whatsapp_identity=$6) OR ($2 IS NOT NULL AND (normalized_phone=$2 OR normalized_alternative_phone=$2)) OR ($3 IS NOT NULL AND normalized_email=$3) OR ($1 IS NOT NULL AND (normalized_phone=$1 OR normalized_alternative_phone=$1))) ORDER BY confidence DESC, updated_at DESC LIMIT 20',
      alt, phone, email, providerKey, providerContactId, whatsapp, c.tenantId, c.companyId, excludeLeadId ?? null,
    );
  }
}
