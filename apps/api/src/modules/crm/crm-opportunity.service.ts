import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateOpportunityInput } from './crm.schemas';

export interface OpportunityRow {
  id: string;
  customerId: string;
  ownerUserId: string | null;
  title: string;
  stage: string;
  estimatedValue: unknown;
  currency: string;
  probability: number;
  expectedCloseDate: Date | null;
  version: number;
}

type OpportunityListRow = Omit<OpportunityRow, 'customerId'> & {
  leadId: string | null;
  customerId: string | null;
  leadFirstName: string | null;
  leadLastName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  updatedAt: Date;
};

type OpportunityDetailRow = OpportunityRow & {
  leadId: string | null;
  lostReason: string | null;
  lostReasonId: string | null;
  lostReasonCode: string | null;
  lostReasonLabel: string | null;
  lostReasonNote: string | null;
  saleId: string | null;
  commercialSnapshot: unknown;
  convertedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  leadFirstName: string | null;
  leadLastName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
};

type FollowUpRow = {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  assignedUserId: string;
  channel: string;
  status: string;
  dueAt: Date;
  note: string | null;
  outcome: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type EventRow = {
  id: string;
  eventType: string;
  actorUserId: string;
  metadata: unknown;
  createdAt: Date;
};

@Injectable()
export class CrmOpportunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private requireBranchId() {
    const branchId = this.context().branchId;
    if (!branchId) {
      throw new BadRequestException('CRM mutation requires an active branch.');
    }
    return branchId;
  }

  private async assertAssignableUser(userId: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=$1::text AND m."tenantId"=$2::text
         AND m."companyId"=$3::text AND m.status='ACTIVE'
         AND ($4::text IS NULL OR r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
         ))
       LIMIT 1`,
      userId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!rows.length) {
      throw new BadRequestException(
        'CRM assignee is not an active company member.',
      );
    }
  }

  async list(filters: {
    stage?: string;
    ownerUserId?: string;
    search?: string;
    updatedBefore?: Date;
    limit?: number;
  }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const search = filters.search?.trim() ? `%${filters.search.trim()}%` : null;
    return this.prisma.$queryRawUnsafe<OpportunityListRow[]>(
      `SELECT o.id,o.lead_id AS "leadId",o.customer_id AS "customerId",o.title,o.stage,
              o.estimated_value AS "estimatedValue",o.currency,o.probability,
              o.expected_close_date AS "expectedCloseDate",o.owner_user_id AS "ownerUserId",o.version,
              l.first_name AS "leadFirstName",l.last_name AS "leadLastName",
              c."firstName" AS "customerFirstName",c."lastName" AS "customerLastName",
              o.updated_at AS "updatedAt"
       FROM crm_opportunities o
       LEFT JOIN crm_leads l
         ON l.id=o.lead_id
        AND l.tenant_id=o.tenant_id
        AND l.company_id=o.company_id
        AND l.branch_id=o.branch_id
       LEFT JOIN customers c
         ON c.id=o.customer_id
        AND c."tenantId"=o.tenant_id
        AND c."branchId"=o.branch_id
       WHERE o.tenant_id=$1::text AND o.company_id=$2::text
         AND ($3::text IS NULL OR o.branch_id=$3::text)
         AND ($4::text IS NULL OR o.stage=$4::text)
         AND ($5::text IS NULL OR o.owner_user_id=$5::text)
         AND ($6::text IS NULL OR (
           o.title ILIKE $6::text OR
           COALESCE(l.first_name,'') ILIKE $6::text OR
           COALESCE(l.last_name,'') ILIKE $6::text OR
           COALESCE(c."firstName",'') ILIKE $6::text OR
           COALESCE(c."lastName",'') ILIKE $6::text
         ))
         AND ($7::timestamptz IS NULL OR o.updated_at < $7::timestamptz)
       ORDER BY o.updated_at DESC,o.id
       LIMIT $8`,
      context.tenantId,
      context.companyId,
      context.branchId,
      filters.stage ?? null,
      filters.ownerUserId ?? null,
      search,
      filters.updatedBefore ?? null,
      limit,
    );
  }

  async getDetail(id: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<OpportunityDetailRow[]>(
      `SELECT o.id,o.lead_id AS "leadId",o.customer_id AS "customerId",
              o.owner_user_id AS "ownerUserId",o.title,o.stage,
              o.estimated_value AS "estimatedValue",o.currency,o.probability,
              o.expected_close_date AS "expectedCloseDate",o.lost_reason AS "lostReason",
              o.lost_reason_id AS "lostReasonId",lr.code AS "lostReasonCode",lr.label AS "lostReasonLabel",
              o.lost_reason_note AS "lostReasonNote",
              o.sale_id AS "saleId",o.commercial_snapshot AS "commercialSnapshot",
              o.converted_at AS "convertedAt",o.version,
              o.created_at AS "createdAt",o.updated_at AS "updatedAt",
              l.first_name AS "leadFirstName",l.last_name AS "leadLastName",
              c."firstName" AS "customerFirstName",c."lastName" AS "customerLastName"
       FROM crm_opportunities o
       LEFT JOIN crm_leads l
         ON l.id=o.lead_id
        AND l.tenant_id=o.tenant_id
        AND l.company_id=o.company_id
        AND l.branch_id=o.branch_id
       LEFT JOIN customers c
         ON c.id=o.customer_id
        AND c."tenantId"=o.tenant_id
        AND c."branchId"=o.branch_id
       LEFT JOIN crm_lost_reasons lr
         ON lr.id=o.lost_reason_id
        AND lr.tenant_id=o.tenant_id
        AND lr.company_id=o.company_id
       WHERE o.id=$1::text AND o.tenant_id=$2::text AND o.company_id=$3::text
         AND ($4::text IS NULL OR o.branch_id=$4::text)
       LIMIT 1`,
      id,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    const opportunity = rows[0];
    if (!opportunity) {
      throw new NotFoundException('CRM opportunity not found.');
    }

    const [followUps, events] = await Promise.all([
      this.prisma.$queryRawUnsafe<FollowUpRow[]>(
        `SELECT id,lead_id AS "leadId",opportunity_id AS "opportunityId",
                assigned_user_id AS "assignedUserId",channel,status,due_at AS "dueAt",
                note,outcome,completed_at AS "completedAt",cancelled_at AS "cancelledAt",
                cancellation_reason AS "cancellationReason",version,
                created_at AS "createdAt",updated_at AS "updatedAt"
         FROM crm_follow_ups
         WHERE opportunity_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         ORDER BY due_at,id`,
        id,
        context.tenantId,
        context.companyId,
      ),
      this.prisma.$queryRawUnsafe<EventRow[]>(
        `SELECT id,event_type AS "eventType",actor_user_id AS "actorUserId",
                metadata,created_at AS "createdAt"
         FROM crm_events
         WHERE opportunity_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         ORDER BY created_at DESC,id DESC`,
        id,
        context.tenantId,
        context.companyId,
      ),
    ]);

    return { ...opportunity, followUps, events };
  }

  async createFromCustomer(input: CreateOpportunityInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();

    if (input.ownerUserId) {
      await this.assertAssignableUser(input.ownerUserId);
    }

    return this.prisma.$transaction(async (tx) => {
      const customers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id
         FROM customers
         WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text
         LIMIT 1`,
        input.customerId,
        context.tenantId,
        branchId,
      );
      if (!customers.length) {
        throw new BadRequestException(
          'CRM customer is outside the active branch.',
        );
      }

      const rows = await tx.$queryRawUnsafe<OpportunityRow[]>(
        `INSERT INTO crm_opportunities(
           tenant_id,company_id,branch_id,customer_id,owner_user_id,title,
           estimated_value,currency,probability,expected_close_date,created_by_user_id
         ) VALUES(
           $1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11::text
         )
         RETURNING id,customer_id AS "customerId",owner_user_id AS "ownerUserId",title,stage,
                   estimated_value AS "estimatedValue",currency,probability,
                   expected_close_date AS "expectedCloseDate",version`,
        context.tenantId,
        context.companyId,
        branchId,
        input.customerId,
        input.ownerUserId ?? actorUserId,
        input.title,
        input.estimatedValue ?? null,
        input.currency,
        input.probability,
        input.expectedCloseDate ?? null,
        actorUserId,
      );

      const opportunity = rows[0];
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(
           tenant_id,company_id,branch_id,opportunity_id,event_type,actor_user_id,metadata
         ) VALUES($1::text,$2::text,$3::text,$4::text,'OPPORTUNITY_CREATED',$5::text,$6::jsonb)`,
        context.tenantId,
        context.companyId,
        branchId,
        opportunity.id,
        actorUserId,
        JSON.stringify({ customerId: input.customerId, title: input.title }),
      );

      return opportunity;
    });
  }
}
