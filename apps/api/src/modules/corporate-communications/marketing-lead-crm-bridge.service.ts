import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type MarketingLeadRow = {
  id: string;
  branchId: string | null;
  preferredBranchId: string | null;
  campaignId: string | null;
  provider: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  serviceInterest: string | null;
  assignedUserId: string | null;
  crmLeadId: string | null;
};

type RoutingRuleRow = {
  id: string;
  strategy: 'FIXED' | 'ROUND_ROBIN' | 'LEAST_LOADED';
  targetBranchId: string | null;
  targetUserId: string | null;
};

type AssigneeRow = {
  id: string;
  openLeadCount: bigint;
  routedLeadCount: bigint;
};

@Injectable()
export class MarketingLeadCrmBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private async resolveRule(
    tx: Prisma.TransactionClient,
    lead: MarketingLeadRow,
  ) {
    const context = this.context();
    const [rule] = await tx.$queryRawUnsafe<RoutingRuleRow[]>(
      `SELECT id,strategy,target_branch_id AS "targetBranchId",target_user_id AS "targetUserId"
       FROM corporate_lead_routing_rules
       WHERE tenant_id=$1::text AND company_id=$2::text AND active=TRUE
         AND (provider IS NULL OR provider=$3::text)
         AND (campaign_id IS NULL OR campaign_id=$4::text)
       ORDER BY
         CASE WHEN campaign_id IS NOT NULL THEN 0 ELSE 1 END,
         CASE WHEN provider IS NOT NULL THEN 0 ELSE 1 END,
         priority,
         created_at,
         id
       LIMIT 1`,
      context.tenantId,
      context.companyId,
      lead.provider,
      lead.campaignId,
    );
    return rule ?? null;
  }

  private async resolveBranch(
    tx: Prisma.TransactionClient,
    lead: MarketingLeadRow,
    rule: RoutingRuleRow | null,
  ) {
    const context = this.context();
    const branchId =
      rule?.targetBranchId ??
      lead.preferredBranchId ??
      lead.branchId ??
      context.branchId ??
      null;

    if (!branchId) {
      throw new BadRequestException(
        'Marketing lead must resolve to a branch before CRM conversion.',
      );
    }

    if (context.branchId && context.branchId !== branchId) {
      throw new BadRequestException(
        'Marketing lead resolves outside the active branch.',
      );
    }

    const branch = await tx.branch.findFirst({
      where: { id: branchId, companyId: context.companyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException('Resolved branch is not active in this company.');
    }
    return branchId;
  }

  private async eligibleAssignees(
    tx: Prisma.TransactionClient,
    branchId: string,
  ) {
    const context = this.context();
    return tx.$queryRawUnsafe<AssigneeRow[]>(
      `SELECT u.id,
              count(DISTINCT cl.id) FILTER (
                WHERE cl.status IN ('NEW','CONTACTED','QUALIFIED')
              ) AS "openLeadCount",
              count(DISTINCT ml.id) FILTER (
                WHERE ml.assigned_user_id=u.id AND ml.status IN ('ROUTED','IN_CRM')
              ) AS "routedLeadCount"
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       LEFT JOIN crm_leads cl ON cl.owner_user_id=u.id
         AND cl.tenant_id=m."tenantId"
         AND cl.company_id=m."companyId"
         AND cl.branch_id=$3::text
       LEFT JOIN corporate_marketing_leads ml ON ml.assigned_user_id=u.id
         AND ml.tenant_id=m."tenantId"
         AND ml.company_id=m."companyId"
         AND ml.branch_id=$3::text
       WHERE m."tenantId"=$1::text AND m."companyId"=$2::text
         AND m.status='ACTIVE'
         AND (r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$3::text
         ))
       GROUP BY u.id
       ORDER BY u.id`,
      context.tenantId,
      context.companyId,
      branchId,
    );
  }

  private async assertAssignee(
    tx: Prisma.TransactionClient,
    userId: string,
    branchId: string,
  ) {
    const context = this.context();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=$1::text AND m."tenantId"=$2::text AND m."companyId"=$3::text
         AND m.status='ACTIVE'
         AND (r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
         ))
       LIMIT 1`,
      userId,
      context.tenantId,
      context.companyId,
      branchId,
    );
    if (!rows.length) {
      throw new BadRequestException(
        'Resolved CRM owner is not active in the target branch.',
      );
    }
  }

  private async resolveOwner(
    tx: Prisma.TransactionClient,
    lead: MarketingLeadRow,
    rule: RoutingRuleRow | null,
    branchId: string,
  ) {
    let ownerUserId = rule?.targetUserId ?? lead.assignedUserId ?? null;

    if (!ownerUserId && rule && rule.strategy !== 'FIXED') {
      const candidates = await this.eligibleAssignees(tx, branchId);
      if (candidates.length) {
        if (rule.strategy === 'LEAST_LOADED') {
          candidates.sort((a, b) => {
            const openDiff = Number(a.openLeadCount) - Number(b.openLeadCount);
            return openDiff || a.id.localeCompare(b.id);
          });
        } else {
          candidates.sort((a, b) => {
            const routedDiff =
              Number(a.routedLeadCount) - Number(b.routedLeadCount);
            return routedDiff || a.id.localeCompare(b.id);
          });
        }
        ownerUserId = candidates[0]?.id ?? null;
      }
    }

    if (rule?.strategy === 'FIXED' && !ownerUserId && !rule.targetBranchId) {
      throw new BadRequestException(
        'Fixed routing requires a target branch or user.',
      );
    }

    if (ownerUserId) {
      await this.assertAssignee(tx, ownerUserId, branchId);
    }
    return ownerUserId;
  }

  async convertToCrm(marketingLeadId: string, actorUserId: string) {
    const context = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const [lead] = await tx.$queryRawUnsafe<MarketingLeadRow[]>(
          `SELECT id,branch_id AS "branchId",preferred_branch_id AS "preferredBranchId",
                  campaign_id AS "campaignId",provider,first_name AS "firstName",last_name AS "lastName",
                  phone,email,service_interest AS "serviceInterest",assigned_user_id AS "assignedUserId",
                  crm_lead_id AS "crmLeadId"
           FROM corporate_marketing_leads
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          marketingLeadId,
          context.tenantId,
          context.companyId,
          context.branchId,
        );

        if (!lead) throw new NotFoundException('Marketing lead not found.');
        if (lead.crmLeadId) {
          return { crmLeadId: lead.crmLeadId, idempotent: true };
        }

        const rule = await this.resolveRule(tx, lead);
        const branchId = await this.resolveBranch(tx, lead, rule);
        const ownerUserId = await this.resolveOwner(tx, lead, rule, branchId);

        const [crmLead] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO crm_leads(
             tenant_id,company_id,branch_id,owner_user_id,first_name,last_name,phone,email,
             source,interest_note,created_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,$10,$11::text)
           RETURNING id`,
          context.tenantId,
          context.companyId,
          branchId,
          ownerUserId,
          lead.firstName,
          lead.lastName,
          lead.phone,
          lead.email,
          `MARKETING_${lead.provider}`.slice(0, 60),
          lead.serviceInterest,
          actorUserId,
        );

        if (!crmLead) {
          throw new BadRequestException('CRM lead could not be created.');
        }

        await tx.$executeRawUnsafe(
          `UPDATE corporate_marketing_leads
           SET branch_id=$1::text,assigned_user_id=$2::text,crm_lead_id=$3::text,
               status='IN_CRM',converted_to_crm_at=now(),updated_at=now()
           WHERE id=$4::text`,
          branchId,
          ownerUserId,
          crmLead.id,
          lead.id,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO crm_events(
             tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,'MARKETING_LEAD_IMPORTED',$5::text,$6::jsonb)`,
          context.tenantId,
          context.companyId,
          branchId,
          crmLead.id,
          actorUserId,
          JSON.stringify({
            marketingLeadId: lead.id,
            campaignId: lead.campaignId,
            provider: lead.provider,
            routingRuleId: rule?.id ?? null,
            routingStrategy: rule?.strategy ?? null,
          }),
        );

        return {
          crmLeadId: crmLead.id,
          branchId,
          ownerUserId,
          routingRuleId: rule?.id ?? null,
          routingStrategy: rule?.strategy ?? null,
          idempotent: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
