import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmAssignmentService } from '../crm/crm-assignment.service';
import {
  routingConditionsSchema,
  type RoutingConditionsInput,
} from './corporate-communications.schemas';

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
  conditions: unknown;
};

@Injectable()
export class MarketingLeadCrmBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly crmAssignment: CrmAssignmentService,
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
      `SELECT id,strategy,target_branch_id AS "targetBranchId",target_user_id AS "targetUserId",conditions
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
        'Müşteri ilişkilerine aktarmadan önce potansiyel müşteri bir şubeye yönlendirilmelidir.',
      );
    }

    if (context.branchId && context.branchId !== branchId) {
      throw new BadRequestException(
        'Potansiyel müşteri aktif şube dışında bir şubeye yönleniyor.',
      );
    }

    const branch = await tx.branch.findFirst({
      where: { id: branchId, companyId: context.companyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException('Belirlenen hedef şube bu şirkette aktif değil.');
    }
    return branchId;
  }

  private followUpPolicy(rule: RoutingRuleRow | null): RoutingConditionsInput {
    return routingConditionsSchema.parse(rule?.conditions ?? {});
  }

  private async createInitialFollowUp(
    tx: Prisma.TransactionClient,
    input: {
      crmLeadId: string;
      branchId: string;
      ownerUserId: string | null;
      actorUserId: string;
      marketingLeadId: string;
      provider: string;
      campaignId: string | null;
      rule: RoutingRuleRow | null;
    },
  ) {
    if (!input.ownerUserId) return null;
    const policy = this.followUpPolicy(input.rule);
    if (!policy.autoFollowUp) return null;

    const context = this.context();
    const dueAt = new Date(Date.now() + policy.followUpSlaMinutes * 60_000);
    const [followUp] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO crm_follow_ups(
         tenant_id,company_id,branch_id,lead_id,assigned_user_id,channel,due_at,note,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9::text)
       RETURNING id`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.crmLeadId,
      input.ownerUserId,
      policy.followUpChannel,
      dueAt,
      `Pazarlama talebi ilk temas · ${input.provider}`,
      input.actorUserId,
    );
    if (!followUp) return null;

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,lead_id,follow_up_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'FOLLOW_UP_CREATED',$6::text,$7::jsonb)`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.crmLeadId,
      followUp.id,
      input.actorUserId,
      JSON.stringify({
        source: 'CORPORATE_COMMUNICATIONS',
        marketingLeadId: input.marketingLeadId,
        campaignId: input.campaignId,
        routingRuleId: input.rule?.id ?? null,
        channel: policy.followUpChannel,
        dueAt: dueAt.toISOString(),
        slaMinutes: policy.followUpSlaMinutes,
      }),
    );

    return {
      id: followUp.id,
      dueAt,
      channel: policy.followUpChannel,
      slaMinutes: policy.followUpSlaMinutes,
    };
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

        if (!lead) throw new NotFoundException('Potansiyel müşteri kaydı bulunamadı.');
        if (lead.crmLeadId) {
          return { crmLeadId: lead.crmLeadId, idempotent: true };
        }

        const rule = await this.resolveRule(tx, lead);
        const branchId = await this.resolveBranch(tx, lead, rule);
        const assignment = await this.crmAssignment.resolveOwner(
          {
            branchId,
            source: `MARKETING_${lead.provider}`,
            requestedOwnerUserId: rule?.targetUserId ?? lead.assignedUserId,
            actorUserId,
          },
          tx,
        );
        const ownerUserId = assignment.ownerUserId;

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
          throw new BadRequestException('Müşteri ilişkileri potansiyel müşteri kaydı oluşturulamadı.');
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

        await this.crmAssignment.recordAssignment(
          {
            leadId: crmLead.id,
            branchId,
            previousOwnerUserId: null,
            assignedUserId: ownerUserId,
            ruleId: assignment.ruleId,
            mode: assignment.mode,
            reason: assignment.reason,
            assignedByUserId: actorUserId,
          },
          tx,
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
            crmAssignmentRuleId: assignment.ruleId,
            crmAssignmentMode: assignment.mode,
            crmAssignmentReason: assignment.reason,
          }),
        );

        const followUp = await this.createInitialFollowUp(tx, {
          crmLeadId: crmLead.id,
          branchId,
          ownerUserId,
          actorUserId,
          marketingLeadId: lead.id,
          provider: lead.provider,
          campaignId: lead.campaignId,
          rule,
        });

        return {
          crmLeadId: crmLead.id,
          branchId,
          ownerUserId,
          routingRuleId: rule?.id ?? null,
          routingStrategy: rule?.strategy ?? null,
          crmAssignmentRuleId: assignment.ruleId,
          crmAssignmentMode: assignment.mode,
          crmAssignmentReason: assignment.reason,
          followUpId: followUp?.id ?? null,
          followUpDueAt: followUp?.dueAt ?? null,
          followUpChannel: followUp?.channel ?? null,
          followUpSlaMinutes: followUp?.slaMinutes ?? null,
          idempotent: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
