import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type MarketingCustomerRow = {
  id: string;
  branchId: string | null;
  crmLeadId: string | null;
  customerId: string | null;
  provider: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
};

const DECLINED_CONSENTS = [
  'KVKK_ACKNOWLEDGEMENT',
  'EXPLICIT_CONSENT',
  'MEMBERSHIP_AGREEMENT',
  'HEALTH_FORM_COMPLETION',
  'HEALTH_DATA_CONSENT',
  'MARKETING_SMS',
  'MARKETING_EMAIL',
  'MARKETING_PHONE',
] as const;

@Injectable()
export class MarketingLeadCustomerBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private customerSource(provider: string) {
    return provider === 'GOOGLE_ADS' ? ('GOOGLE' as const) : ('OTHER' as const);
  }

  async convertToCustomer(marketingLeadId: string, actorUserId: string) {
    const context = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const [lead] = await tx.$queryRawUnsafe<MarketingCustomerRow[]>(
          `SELECT id,branch_id AS "branchId",crm_lead_id AS "crmLeadId",customer_id AS "customerId",
                  provider,first_name AS "firstName",last_name AS "lastName",phone,email
           FROM corporate_marketing_leads
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          marketingLeadId,
          context.tenantId,
          context.companyId,
          context.branchId,
        );

        if (!lead) throw new NotFoundException('Marketing lead not found.');
        if (!lead.branchId) {
          throw new BadRequestException(
            'Marketing lead must be routed to a branch before customer conversion.',
          );
        }
        if (!lead.crmLeadId) {
          throw new BadRequestException(
            'Marketing lead must be converted to CRM before customer conversion.',
          );
        }
        if (lead.customerId) {
          return { customerId: lead.customerId, idempotent: true, matchedExisting: true };
        }

        const existingCustomer = await tx.customer.findFirst({
          where: {
            tenantId: context.tenantId,
            branchId: lead.branchId,
            OR: [
              ...(lead.phone ? [{ phone: lead.phone }] : []),
              ...(lead.email
                ? [{ email: { equals: lead.email.toLowerCase(), mode: 'insensitive' as const } }]
                : []),
            ],
          },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });

        let customerId = existingCustomer?.id ?? null;
        let matchedExisting = Boolean(existingCustomer);

        if (!customerId) {
          const customer = await tx.customer.create({
            data: {
              tenantId: context.tenantId,
              branchId: lead.branchId,
              firstName: lead.firstName.trim(),
              lastName: lead.lastName.trim(),
              phone: lead.phone?.trim() || null,
              email: lead.email?.trim().toLowerCase() || null,
              customerSource: this.customerSource(lead.provider),
            },
            select: { id: true },
          });
          customerId = customer.id;
          matchedExisting = false;

          await tx.customerConsent.createMany({
            data: DECLINED_CONSENTS.map((type) => ({
              tenantId: context.tenantId,
              branchId: lead.branchId!,
              customerId: customer.id,
              type,
              status: 'DECLINED' as const,
              documentVersion: '1.0',
              acceptedAt: null,
              source: 'STAFF' as const,
            })),
          });
        }

        await tx.$executeRawUnsafe(
          `UPDATE corporate_marketing_leads
           SET customer_id=$1::text,updated_at=now()
           WHERE id=$2::text`,
          customerId,
          lead.id,
        );

        await tx.$executeRawUnsafe(
          `UPDATE crm_leads
           SET customer_id=$1::text,updated_at=now(),version=version+1
           WHERE id=$2::text AND tenant_id=$3::text AND company_id=$4::text AND branch_id=$5::text
             AND (customer_id IS NULL OR customer_id=$1::text)`,
          customerId,
          lead.crmLeadId,
          context.tenantId,
          context.companyId,
          lead.branchId,
        );

        const linkedCrmRows = await tx.$queryRawUnsafe<Array<{ customerId: string | null }>>(
          `SELECT customer_id AS "customerId" FROM crm_leads
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text LIMIT 1`,
          lead.crmLeadId,
          context.tenantId,
          context.companyId,
          lead.branchId,
        );
        if (linkedCrmRows[0]?.customerId !== customerId) {
          throw new BadRequestException(
            'CRM lead is already linked to a different customer.',
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO crm_events(
             tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,'MARKETING_CUSTOMER_LINKED',$5::text,$6::jsonb)`,
          context.tenantId,
          context.companyId,
          lead.branchId,
          lead.crmLeadId,
          actorUserId,
          JSON.stringify({
            marketingLeadId: lead.id,
            customerId,
            matchedExisting,
            provider: lead.provider,
          }),
        );

        return { customerId, idempotent: false, matchedExisting };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
