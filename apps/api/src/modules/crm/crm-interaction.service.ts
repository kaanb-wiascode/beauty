import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmDataScopeService } from './crm-data-scope.service';
import type { CreateCrmInteractionInput, ListCrmInteractionsInput } from './crm-interaction.schemas';

@Injectable()
export class CrmInteractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly dataScope: CrmDataScopeService,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private requireBranchId() {
    const branchId = this.context().branchId;
    if (!branchId) throw new BadRequestException('Görüşme kaydı için aktif bir şube seçilmelidir.');
    return branchId;
  }

  async list(filters: ListCrmInteractionsInput) {
    const context = this.context();
    const visibility = await this.dataScope.resolve();
    return this.prisma.$queryRawUnsafe(
      `SELECT i.id,i.customer_id AS "customerId",i.lead_id AS "leadId",i.opportunity_id AS "opportunityId",
              i.owner_user_id AS "ownerUserId",i.type,i.direction,i.status,i.outcome_code AS "outcomeCode",i.result,i.notes,
              i.started_at AS "startedAt",i.ended_at AS "endedAt",i.duration_seconds AS "durationSeconds",
              i.next_action AS "nextAction",i.next_action_at AS "nextActionAt",
              u."firstName" AS "ownerFirstName",u."lastName" AS "ownerLastName",
              COALESCE(NULLIF(trim(concat_ws(' ',l.first_name,l.last_name)),''),
                       NULLIF(trim(concat_ws(' ',c."firstName",c."lastName")),''),
                       o.title,'Müşteri İlişkileri Kaydı') AS "subjectLabel"
         FROM crm_interactions i
         LEFT JOIN users u ON u.id=i.owner_user_id
         LEFT JOIN crm_leads l ON l.id=i.lead_id
         LEFT JOIN crm_opportunities o ON o.id=i.opportunity_id
         LEFT JOIN customers c ON c.id=i.customer_id
        WHERE i.tenant_id=$1::text AND i.company_id=$2::text
          AND ($3::text IS NULL OR i.branch_id=$3::text)
          AND ($4::text IS NULL OR i.owner_user_id=$4::text)
          AND ($5::text IS NULL OR i.lead_id=$5::text)
          AND ($6::text IS NULL OR i.opportunity_id=$6::text)
          AND ($7::text IS NULL OR i.customer_id=$7::text)
          AND ($8::text IS NULL OR i.type=$8::text)
          AND ($9::text IS NULL OR i.direction=$9::text)
          AND ($10::text IS NULL OR i.status=$10::text)
          AND ($11::text IS NULL OR i.outcome_code=$11::text)
          AND ($12::timestamptz IS NULL OR i.started_at >= $12::timestamptz)
          AND ($13::timestamptz IS NULL OR i.started_at <= $13::timestamptz)
          AND ($14::boolean=FALSE OR i.owner_user_id=ANY($15::text[]))
        ORDER BY i.started_at DESC,i.id DESC
        LIMIT $16`,
      context.tenantId,
      context.companyId,
      visibility.branchId,
      filters.ownerUserId ?? null,
      filters.leadId ?? null,
      filters.opportunityId ?? null,
      filters.customerId ?? null,
      filters.type ?? null,
      filters.direction ?? null,
      filters.status ?? null,
      filters.outcomeCode ?? null,
      filters.from ?? null,
      filters.to ?? null,
      visibility.restrictOwners,
      visibility.ownerUserIds,
      filters.limit,
    );
  }

  async get(id: string) {
    const context = this.context();
    const visibility = await this.dataScope.resolve();
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT i.* FROM crm_interactions i
        WHERE i.id=$1::text AND i.tenant_id=$2::text AND i.company_id=$3::text
          AND ($4::text IS NULL OR i.branch_id=$4::text)
          AND ($5::boolean=FALSE OR i.owner_user_id=ANY($6::text[]))
        LIMIT 1`,
      id,
      context.tenantId,
      context.companyId,
      visibility.branchId,
      visibility.restrictOwners,
      visibility.ownerUserIds,
    );
    if (!rows.length) throw new NotFoundException('Görüşme kaydı bulunamadı.');
    return rows[0];
  }

  async create(input: CreateCrmInteractionInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    const ownerUserId = input.ownerUserId ?? actorUserId;
    await this.dataScope.assertOwnerAllowed(ownerUserId);
    if (input.leadId) await this.dataScope.assertLeadAccess(input.leadId);
    if (input.opportunityId) await this.dataScope.assertOpportunityAccess(input.opportunityId);

    if (input.leadId) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM crm_leads
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
          LIMIT 1`,
        input.leadId,
        context.tenantId,
        context.companyId,
        branchId,
      );
      if (!rows.length) throw new BadRequestException('Görüşme kaydı yalnızca aktif şubedeki potansiyel müşteriye eklenebilir.');
    }
    if (input.opportunityId) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM crm_opportunities
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
          LIMIT 1`,
        input.opportunityId,
        context.tenantId,
        context.companyId,
        branchId,
      );
      if (!rows.length) throw new BadRequestException('Görüşme kaydı yalnızca aktif şubedeki satış fırsatına eklenebilir.');
    }
    if (input.customerId) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM customers
          WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text
          LIMIT 1`,
        input.customerId,
        context.tenantId,
        branchId,
      );
      if (!rows.length) throw new BadRequestException('Görüşme kaydı yalnızca aktif şubedeki müşteriye eklenebilir.');
    }

    let customerId = input.customerId ?? null;
    if (!customerId && input.opportunityId) {
      const linked = await this.prisma.$queryRawUnsafe<Array<{ customerId: string | null }>>(
        `SELECT customer_id AS "customerId"
           FROM crm_opportunities
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
            AND branch_id=$4::text
          LIMIT 1`,
        input.opportunityId,
        context.tenantId,
        context.companyId,
        branchId,
      );
      customerId = linked[0]?.customerId ?? null;
    }
    if (!customerId && input.leadId) {
      const linked = await this.prisma.$queryRawUnsafe<Array<{ customerId: string | null }>>(
        `SELECT customer_id AS "customerId"
           FROM crm_leads
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
            AND branch_id=$4::text
          LIMIT 1`,
        input.leadId,
        context.tenantId,
        context.companyId,
        branchId,
      );
      customerId = linked[0]?.customerId ?? null;
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO crm_interactions(
         tenant_id,company_id,branch_id,customer_id,lead_id,opportunity_id,owner_user_id,
         type,direction,status,outcome_code,result,notes,started_at,ended_at,duration_seconds,next_action,next_action_at,created_by_user_id
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,
         $8,$9,$10,$11,$12,$13,$14::timestamptz,$15::timestamptz,$16,$17,$18::timestamptz,$19::text
       )
       RETURNING id,customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",
                 owner_user_id AS "ownerUserId",type,direction,status,outcome_code AS "outcomeCode",result,notes,
                 started_at AS "startedAt",ended_at AS "endedAt",duration_seconds AS "durationSeconds",
                 next_action AS "nextAction",next_action_at AS "nextActionAt"`,
      context.tenantId,
      context.companyId,
      branchId,
      customerId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      ownerUserId,
      input.type,
      input.direction,
      input.status,
      input.outcomeCode ?? null,
      input.result ?? null,
      input.notes ?? null,
      input.startedAt ?? new Date(),
      input.endedAt ?? null,
      input.durationSeconds ?? null,
      input.nextAction ?? null,
      input.nextActionAt ?? null,
      actorUserId,
    );

    const interaction = rows[0];

    if (input.leadId && input.status === 'COMPLETED') {
      const touchedAt = input.startedAt ?? new Date();
      await this.prisma.$executeRawUnsafe(
        `UPDATE crm_leads
            SET first_contacted_at=COALESCE(first_contacted_at,$5::timestamptz),
                first_response_at=COALESCE(first_response_at,$5::timestamptz),
                status=CASE WHEN status='NEW' THEN 'CONTACTED' ELSE status END,
                updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
            AND branch_id=$4::text`,
        input.leadId,
        context.tenantId,
        context.companyId,
        branchId,
        touchedAt,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,opportunity_id,event_type,actor_user_id,metadata)
       VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'INTERACTION_CREATED',$6::text,$7::jsonb)`,
      context.tenantId,
      context.companyId,
      branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      actorUserId,
      JSON.stringify({
        interactionId: interaction.id,
        type: input.type,
        direction: input.direction,
        outcomeCode: input.outcomeCode,
        result: input.result,
        nextAction: input.nextAction,
        nextActionAt: input.nextActionAt?.toISOString(),
      }),
    );
    return interaction;
  }
}
