import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateFollowUpInput,
  CreateLeadInput,
  QualifyLeadInput,
  TransitionOpportunityInput,
  UpdateLeadInput,
} from './crm.schemas';

export interface CrmRow {
  id: string;
  [key: string]: unknown;
}

export interface LeadQualificationRow extends CrmRow {
  branchId: string;
  customerId: string | null;
  ownerUserId: string | null;
  status: string;
  version: number;
}

export interface OpportunityTransitionRow extends CrmRow {
  leadId: string | null;
  stage: string;
  probability: number;
  version: number;
}

@Injectable()
export class CrmService {
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

  private async assertAssignableUser(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const context = this.context();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       WHERE u.id=$1::text AND m."tenantId"=$2::text
         AND m."companyId"=$3::text AND m.status='ACTIVE'
       LIMIT 1`,
      userId,
      context.tenantId,
      context.companyId,
    );
    if (!rows.length) {
      throw new BadRequestException(
        'CRM assignee is not an active company member.',
      );
    }
  }

  async listLeads(filters: {
    status?: string;
    ownerUserId?: string;
    search?: string;
    limit?: number;
  }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<CrmRow[]>(
      `SELECT l.id,l.first_name AS "firstName",l.last_name AS "lastName",l.phone,l.email,
              l.source,l.status,l.interest_note AS "interestNote",l.customer_id AS "customerId",
              l.owner_user_id AS "ownerUserId",l.version,l.created_at AS "createdAt",l.updated_at AS "updatedAt",
              o.id AS "opportunityId",o.stage AS "opportunityStage",o.estimated_value AS "estimatedValue"
       FROM crm_leads l
       LEFT JOIN crm_opportunities o ON o.lead_id=l.id
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text
         AND ($3::text IS NULL OR l.branch_id=$3::text)
         AND ($4::text IS NULL OR l.status=$4::text)
         AND ($5::text IS NULL OR l.owner_user_id=$5::text)
         AND ($6::text IS NULL OR concat_ws(' ',l.first_name,l.last_name,l.phone,l.email) ILIKE '%' || $6 || '%')
       ORDER BY l.updated_at DESC,l.id
       LIMIT $7`,
      context.tenantId,
      context.companyId,
      context.branchId,
      filters.status ?? null,
      filters.ownerUserId ?? null,
      filters.search?.trim() || null,
      limit,
    );
  }

  async getLead(id: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<CrmRow[]>(
      `SELECT l.id,l.branch_id AS "branchId",l.first_name AS "firstName",l.last_name AS "lastName",
              l.phone,l.email,l.source,l.status,l.interest_note AS "interestNote",l.lost_reason AS "lostReason",
              l.customer_id AS "customerId",l.owner_user_id AS "ownerUserId",l.version,
              l.created_at AS "createdAt",l.updated_at AS "updatedAt"
       FROM crm_leads l
       WHERE l.id=$1::text AND l.tenant_id=$2::text AND l.company_id=$3::text
         AND ($4::text IS NULL OR l.branch_id=$4::text)
       LIMIT 1`,
      id,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!rows.length) throw new NotFoundException('CRM lead not found.');

    const [opportunities, followUps, events] = await Promise.all([
      this.prisma.$queryRawUnsafe<CrmRow[]>(
        `SELECT id,title,stage,estimated_value AS "estimatedValue",currency,probability,
                expected_close_date AS "expectedCloseDate",lost_reason AS "lostReason",version,
                created_at AS "createdAt",updated_at AS "updatedAt"
         FROM crm_opportunities
         WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        id,
        context.tenantId,
        context.companyId,
      ),
      this.prisma.$queryRawUnsafe<CrmRow[]>(
        `SELECT id,lead_id AS "leadId",opportunity_id AS "opportunityId",assigned_user_id AS "assignedUserId",
                channel,status,due_at AS "dueAt",note,outcome,completed_at AS "completedAt",created_at AS "createdAt"
         FROM crm_follow_ups
         WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         ORDER BY due_at,id`,
        id,
        context.tenantId,
        context.companyId,
      ),
      this.prisma.$queryRawUnsafe<CrmRow[]>(
        `SELECT id,event_type AS "eventType",actor_user_id AS "actorUserId",metadata,created_at AS "createdAt"
         FROM crm_events
         WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         ORDER BY created_at,id`,
        id,
        context.tenantId,
        context.companyId,
      ),
    ]);
    return { ...rows[0], opportunities, followUps, events };
  }

  async createLead(input: CreateLeadInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    if (input.ownerUserId) await this.assertAssignableUser(input.ownerUserId);

    return this.prisma.$transaction(async (tx) => {
      if (input.customerId) {
        const customers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM customers
           WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text LIMIT 1`,
          input.customerId,
          context.tenantId,
          branchId,
        );
        if (!customers.length)
          throw new BadRequestException(
            'CRM customer is outside the active branch.',
          );
      }

      const rows = await tx.$queryRawUnsafe<CrmRow[]>(
        `INSERT INTO crm_leads(
           tenant_id,company_id,branch_id,customer_id,owner_user_id,first_name,last_name,phone,email,
           source,interest_note,created_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12::text)
         RETURNING id,first_name AS "firstName",last_name AS "lastName",phone,email,source,status,
                   interest_note AS "interestNote",owner_user_id AS "ownerUserId",customer_id AS "customerId",version`,
        context.tenantId,
        context.companyId,
        branchId,
        input.customerId ?? null,
        input.ownerUserId ?? actorUserId,
        input.firstName,
        input.lastName,
        input.phone ?? null,
        input.email?.toLowerCase() ?? null,
        input.source,
        input.interestNote ?? null,
        actorUserId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_CREATED',$5::text,$6::jsonb)`,
        context.tenantId,
        context.companyId,
        branchId,
        rows[0].id,
        actorUserId,
        JSON.stringify({ source: input.source }),
      );
      return rows[0];
    });
  }

  async updateLead(id: string, input: UpdateLeadInput, actorUserId: string) {
    const context = this.context();
    if (input.ownerUserId) await this.assertAssignableUser(input.ownerUserId);
    if (input.status === 'LOST' && !input.lostReason) {
      throw new BadRequestException('Lost lead requires a reason.');
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<CrmRow[]>(
        `UPDATE crm_leads SET
           first_name=COALESCE($5,first_name),last_name=COALESCE($6,last_name),
           phone=CASE WHEN $7::boolean THEN $8 ELSE phone END,
           email=CASE WHEN $9::boolean THEN lower($10) ELSE email END,
           source=COALESCE($11,source),interest_note=CASE WHEN $12::boolean THEN $13 ELSE interest_note END,
           owner_user_id=CASE WHEN $14::boolean THEN $15::text ELSE owner_user_id END,
           status=COALESCE($16,status),lost_reason=CASE WHEN $16='LOST' THEN $17 ELSE NULL END,
           version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text) AND version=$18
         RETURNING id,status,version,updated_at AS "updatedAt"`,
        id,
        context.tenantId,
        context.companyId,
        context.branchId,
        input.firstName ?? null,
        input.lastName ?? null,
        input.phone !== undefined,
        input.phone ?? null,
        input.email !== undefined,
        input.email ?? null,
        input.source ?? null,
        input.interestNote !== undefined,
        input.interestNote ?? null,
        input.ownerUserId !== undefined,
        input.ownerUserId ?? null,
        input.status ?? null,
        input.lostReason ?? null,
        input.version,
      );
      if (!rows.length)
        throw new ConflictException(
          'Lead changed or is outside the active scope.',
        );
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         SELECT tenant_id,company_id,branch_id,id,'LEAD_UPDATED',$2::text,$3::jsonb FROM crm_leads WHERE id=$1::text`,
        id,
        actorUserId,
        JSON.stringify({ status: input.status ?? undefined }),
      );
      return rows[0];
    });
  }

  async qualifyLead(id: string, input: QualifyLeadInput, actorUserId: string) {
    const context = this.context();
    if (input.ownerUserId) await this.assertAssignableUser(input.ownerUserId);
    return this.prisma.$transaction(
      async (tx) => {
        const leads = await tx.$queryRawUnsafe<LeadQualificationRow[]>(
          `SELECT id,branch_id AS "branchId",customer_id AS "customerId",owner_user_id AS "ownerUserId",status,version
           FROM crm_leads
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          id,
          context.tenantId,
          context.companyId,
          context.branchId,
        );
        const lead = leads[0];
        if (!lead) throw new NotFoundException('CRM lead not found.');

        const existing = await tx.$queryRawUnsafe<CrmRow[]>(
          `SELECT id,title,stage,version FROM crm_opportunities
           WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,
          id,
          context.tenantId,
          context.companyId,
        );
        if (existing.length) return { ...existing[0], idempotent: true };
        if (lead.version !== input.version)
          throw new ConflictException('Lead version is stale.');
        if (lead.status === 'LOST')
          throw new BadRequestException('Lost lead cannot be qualified.');

        const opportunities = await tx.$queryRawUnsafe<CrmRow[]>(
          `INSERT INTO crm_opportunities(
             tenant_id,company_id,branch_id,lead_id,customer_id,owner_user_id,title,estimated_value,
             currency,probability,expected_close_date,created_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12::text)
           RETURNING id,title,stage,estimated_value AS "estimatedValue",currency,probability,
                     expected_close_date AS "expectedCloseDate",version`,
          context.tenantId,
          context.companyId,
          lead.branchId,
          id,
          lead.customerId,
          input.ownerUserId ?? lead.ownerUserId ?? actorUserId,
          input.title,
          input.estimatedValue ?? null,
          input.currency,
          input.probability,
          input.expectedCloseDate ?? null,
          actorUserId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE crm_leads SET status='QUALIFIED',version=version+1,updated_at=NOW() WHERE id=$1::text`,
          id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,opportunity_id,event_type,actor_user_id,metadata)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'LEAD_QUALIFIED',$6::text,$7::jsonb)`,
          context.tenantId,
          context.companyId,
          lead.branchId,
          id,
          opportunities[0].id,
          actorUserId,
          JSON.stringify({ title: input.title }),
        );
        return { ...opportunities[0], idempotent: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listOpportunities(filters: {
    stage?: string;
    ownerUserId?: string;
    limit?: number;
  }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<CrmRow[]>(
      `SELECT o.id,o.lead_id AS "leadId",o.customer_id AS "customerId",o.title,o.stage,
              o.estimated_value AS "estimatedValue",o.currency,o.probability,
              o.expected_close_date AS "expectedCloseDate",o.owner_user_id AS "ownerUserId",o.version,
              l.first_name AS "leadFirstName",l.last_name AS "leadLastName",o.updated_at AS "updatedAt"
       FROM crm_opportunities o LEFT JOIN crm_leads l ON l.id=o.lead_id
       WHERE o.tenant_id=$1::text AND o.company_id=$2::text
         AND ($3::text IS NULL OR o.branch_id=$3::text)
         AND ($4::text IS NULL OR o.stage=$4::text)
         AND ($5::text IS NULL OR o.owner_user_id=$5::text)
       ORDER BY o.updated_at DESC,o.id LIMIT $6`,
      context.tenantId,
      context.companyId,
      context.branchId,
      filters.stage ?? null,
      filters.ownerUserId ?? null,
      limit,
    );
  }

  async transitionOpportunity(
    id: string,
    input: TransitionOpportunityInput,
    actorUserId: string,
  ) {
    const context = this.context();
    if (input.stage === 'LOST' && !input.lostReason) {
      throw new BadRequestException('Lost opportunity requires a reason.');
    }
    const probability =
      input.stage === 'WON'
        ? 100
        : input.stage === 'LOST'
          ? 0
          : input.probability;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<OpportunityTransitionRow[]>(
        `UPDATE crm_opportunities SET stage=$5,probability=COALESCE($6,probability),
           estimated_value=CASE WHEN $7::boolean THEN $8 ELSE estimated_value END,
           expected_close_date=CASE WHEN $9::boolean THEN $10 ELSE expected_close_date END,
           lost_reason=CASE WHEN $5='LOST' THEN $11 ELSE NULL END,version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text) AND version=$12
           AND stage NOT IN ('WON','LOST')
           AND (
             ($5='NEEDS_ANALYSIS' AND stage='QUALIFIED') OR
             ($5='PROPOSAL' AND stage IN ('NEEDS_ANALYSIS','NEGOTIATION')) OR
             ($5='NEGOTIATION' AND stage='PROPOSAL') OR
             ($5='WON' AND stage IN ('PROPOSAL','NEGOTIATION')) OR
             ($5='LOST' AND stage IN ('QUALIFIED','NEEDS_ANALYSIS','PROPOSAL','NEGOTIATION'))
           )
         RETURNING id,lead_id AS "leadId",stage,probability,version,updated_at AS "updatedAt"`,
        id,
        context.tenantId,
        context.companyId,
        context.branchId,
        input.stage,
        probability ?? null,
        input.estimatedValue !== undefined,
        input.estimatedValue ?? null,
        input.expectedCloseDate !== undefined,
        input.expectedCloseDate ?? null,
        input.lostReason ?? null,
        input.version,
      );
      if (!rows.length)
        throw new ConflictException(
          'Opportunity changed, is closed, or is outside the active scope.',
        );
      const opportunity = rows[0];
      if (input.stage === 'WON' && opportunity.leadId) {
        await tx.$executeRawUnsafe(
          `UPDATE crm_leads SET status='CONVERTED',version=version+1,updated_at=NOW() WHERE id=$1::text`,
          opportunity.leadId,
        );
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,opportunity_id,event_type,actor_user_id,metadata)
         SELECT tenant_id,company_id,branch_id,lead_id,id,'OPPORTUNITY_STAGE_CHANGED',$2::text,$3::jsonb
         FROM crm_opportunities WHERE id=$1::text`,
        id,
        actorUserId,
        JSON.stringify({ stage: input.stage, probability }),
      );
      return opportunity;
    });
  }

  async listFollowUps(filters: {
    status?: string;
    assignedUserId?: string;
    dueBefore?: Date;
    limit?: number;
  }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<CrmRow[]>(
      `SELECT f.id,f.lead_id AS "leadId",f.opportunity_id AS "opportunityId",
              f.assigned_user_id AS "assignedUserId",f.channel,f.status,f.due_at AS "dueAt",
              f.note,f.outcome,f.completed_at AS "completedAt",f.created_at AS "createdAt"
       FROM crm_follow_ups f
       WHERE f.tenant_id=$1::text AND f.company_id=$2::text
         AND ($3::text IS NULL OR f.branch_id=$3::text)
         AND ($4::text IS NULL OR f.status=$4::text)
         AND ($5::text IS NULL OR f.assigned_user_id=$5::text)
         AND ($6::timestamptz IS NULL OR f.due_at<=$6::timestamptz)
       ORDER BY CASE WHEN f.status='OPEN' THEN 0 ELSE 1 END,f.due_at,f.id LIMIT $7`,
      context.tenantId,
      context.companyId,
      context.branchId,
      filters.status ?? null,
      filters.assignedUserId ?? null,
      filters.dueBefore ?? null,
      limit,
    );
  }

  async createFollowUp(input: CreateFollowUpInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    await this.assertAssignableUser(input.assignedUserId);
    return this.prisma.$transaction(async (tx) => {
      const subjectTable = input.leadId ? 'crm_leads' : 'crm_opportunities';
      const subjectId = input.leadId ?? input.opportunityId;
      const subjects = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM ${subjectTable}
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text LIMIT 1`,
        subjectId,
        context.tenantId,
        context.companyId,
        branchId,
      );
      if (!subjects.length)
        throw new BadRequestException(
          'CRM follow-up subject is outside the active branch.',
        );

      const rows = await tx.$queryRawUnsafe<CrmRow[]>(
        `INSERT INTO crm_follow_ups(
           tenant_id,company_id,branch_id,lead_id,opportunity_id,assigned_user_id,channel,due_at,note,created_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10::text)
         RETURNING id,lead_id AS "leadId",opportunity_id AS "opportunityId",assigned_user_id AS "assignedUserId",
                   channel,status,due_at AS "dueAt",note,created_at AS "createdAt"`,
        context.tenantId,
        context.companyId,
        branchId,
        input.leadId ?? null,
        input.opportunityId ?? null,
        input.assignedUserId,
        input.channel,
        input.dueAt,
        input.note ?? null,
        actorUserId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,opportunity_id,follow_up_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'FOLLOW_UP_CREATED',$7::text,$8::jsonb)`,
        context.tenantId,
        context.companyId,
        branchId,
        input.leadId ?? null,
        input.opportunityId ?? null,
        rows[0].id,
        actorUserId,
        JSON.stringify({
          channel: input.channel,
          dueAt: input.dueAt.toISOString(),
        }),
      );
      return rows[0];
    });
  }

  async completeFollowUp(id: string, outcome: string, actorUserId: string) {
    const context = this.context();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<CrmRow[]>(
        `UPDATE crm_follow_ups SET status='COMPLETED',outcome=$5,completed_at=NOW(),updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text) AND status='OPEN'
         RETURNING id,lead_id AS "leadId",opportunity_id AS "opportunityId",status,outcome,completed_at AS "completedAt"`,
        id,
        context.tenantId,
        context.companyId,
        context.branchId,
        outcome,
      );
      if (!rows.length)
        throw new ConflictException(
          'Follow-up is not open or is outside the active scope.',
        );
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,opportunity_id,follow_up_id,event_type,actor_user_id,metadata)
         SELECT tenant_id,company_id,branch_id,lead_id,opportunity_id,id,'FOLLOW_UP_COMPLETED',$2::text,$3::jsonb
         FROM crm_follow_ups WHERE id=$1::text`,
        id,
        actorUserId,
        JSON.stringify({ outcome }),
      );
      return rows[0];
    });
  }
}
