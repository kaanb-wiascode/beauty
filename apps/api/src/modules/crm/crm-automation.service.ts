import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type Tx = Prisma.TransactionClient;

type AutomationFollowUp = {
  leadId?: string | null;
  opportunityId?: string | null;
  branchId: string;
  assignedUserId: string;
  actorUserId: string;
  channel?: 'CALL' | 'SMS' | 'EMAIL' | 'WHATSAPP' | 'IN_PERSON' | 'OTHER';
  dueAt: Date;
  note: string;
  automationKey: string;
  rule: string;
};

type StaleOpportunityRow = {
  id: string;
  branchId: string;
  ownerUserId: string;
  updatedAt: Date;
};

@Injectable()
export class CrmAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private async createFollowUpOnce(tx: Tx, input: AutomationFollowUp) {
    const context = this.context();
    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_events
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         AND event_type='AUTOMATION_EXECUTED'
         AND metadata->>'automationKey'=$4
       LIMIT 1`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.automationKey,
    );
    if (existing.length) return { created: false as const };

    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO crm_follow_ups(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,assigned_user_id,channel,due_at,note,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10::text)
       RETURNING id`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      input.assignedUserId,
      input.channel ?? 'CALL',
      input.dueAt,
      input.note,
      input.actorUserId,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,follow_up_id,event_type,actor_user_id,metadata
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'FOLLOW_UP_CREATED',$7::text,$8::jsonb
       )`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      rows[0].id,
      input.actorUserId,
      JSON.stringify({
        channel: input.channel ?? 'CALL',
        dueAt: input.dueAt.toISOString(),
        automated: true,
        rule: input.rule,
      }),
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,follow_up_id,event_type,actor_user_id,metadata
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'AUTOMATION_EXECUTED',$7::text,$8::jsonb
       )`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      rows[0].id,
      input.actorUserId,
      JSON.stringify({ automationKey: input.automationKey, rule: input.rule }),
    );

    return { created: true as const, followUpId: rows[0].id };
  }

  async afterLeadCreated(
    tx: Tx,
    input: {
      leadId: string;
      branchId: string;
      assignedUserId: string;
      actorUserId: string;
    },
  ) {
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.createFollowUpOnce(tx, {
      leadId: input.leadId,
      branchId: input.branchId,
      assignedUserId: input.assignedUserId,
      actorUserId: input.actorUserId,
      dueAt,
      note: 'Otomatik takip: yeni lead için ilk temas.',
      automationKey: `LEAD_FIRST_TOUCH:${input.leadId}`,
      rule: 'LEAD_FIRST_TOUCH',
    });
  }

  async afterOpportunityStageChanged(
    tx: Tx,
    input: {
      opportunityId: string;
      leadId: string | null;
      branchId: string;
      ownerUserId: string | null;
      stage: string;
      actorUserId: string;
      version: number;
    },
  ) {
    if (!input.ownerUserId || ['WON', 'LOST'].includes(input.stage)) {
      return { created: false as const };
    }

    const delayDays = input.stage === 'NEGOTIATION' ? 1 : 2;
    const dueAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
    return this.createFollowUpOnce(tx, {
      leadId: input.leadId,
      opportunityId: input.opportunityId,
      branchId: input.branchId,
      assignedUserId: input.ownerUserId,
      actorUserId: input.actorUserId,
      dueAt,
      note: `Otomatik takip: fırsat ${input.stage} aşamasına geçti.`,
      automationKey: `OPPORTUNITY_STAGE:${input.opportunityId}:${input.stage}:v${input.version}`,
      rule: 'OPPORTUNITY_STAGE_FOLLOW_UP',
    });
  }

  async runStaleOpportunitySweep(actorUserId: string, staleDays = 14) {
    const context = this.context();
    const staleBefore = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRawUnsafe<StaleOpportunityRow[]>(
      `SELECT id,branch_id AS "branchId",owner_user_id AS "ownerUserId",updated_at AS "updatedAt"
       FROM crm_opportunities
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
         AND stage NOT IN ('WON','LOST')
         AND owner_user_id IS NOT NULL
         AND updated_at < $4::timestamptz
       ORDER BY updated_at,id
       LIMIT 100`,
      context.tenantId,
      context.companyId,
      context.branchId,
      staleBefore,
    );

    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const result = await this.prisma.$transaction((tx) =>
        this.createFollowUpOnce(tx, {
          opportunityId: row.id,
          branchId: row.branchId,
          assignedUserId: row.ownerUserId,
          actorUserId,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          note: `Otomatik takip: fırsat ${staleDays}+ gündür hareketsiz.`,
          automationKey: `STALE_OPPORTUNITY:${row.id}:${row.updatedAt.toISOString()}`,
          rule: 'STALE_OPPORTUNITY_FOLLOW_UP',
        }),
      );
      if (result.created) created += 1;
      else skipped += 1;
    }

    return { scanned: rows.length, created, skipped, staleDays, staleBefore };
  }
}
