import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CrmAutomationScope } from './crm-automation.service';
import type { CrmMessageChannel } from './crm-message-provider-registry.service';

export type ContactPermissionStatus = 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN';
export type ContactPermissionSource = 'MANUAL' | 'IMPORT' | 'INBOUND_KEYWORD' | 'PROVIDER' | 'SYSTEM';
export type ContactSubjectType = 'CUSTOMER' | 'LEAD';

@Injectable()
export class CrmCommunicationComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(subjectType: ContactSubjectType, subjectId: string) {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    const scope = {
      tenantId: context.tenantId,
      companyId: context.companyId,
      branchId: context.branchId,
    };
    await this.assertSubject(scope, subjectType, subjectId);
    const column = subjectType === 'CUSTOMER' ? 'customer_id' : 'lead_id';
    return this.prisma.$queryRawUnsafe(
      `SELECT id,channel,status,source,reason,changed_at AS "changedAt",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM crm_contact_channel_permissions
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND ${column}=$4::text
       ORDER BY channel`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      subjectId,
    );
  }

  async set(
    subjectType: ContactSubjectType,
    subjectId: string,
    channel: CrmMessageChannel,
    status: ContactPermissionStatus,
    source: ContactPermissionSource,
    reason: string | null,
    actorUserId: string,
  ) {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    const scope = {
      tenantId: context.tenantId,
      companyId: context.companyId,
      branchId: context.branchId,
    };
    await this.assertSubject(scope, subjectType, subjectId);
    const customerId = subjectType === 'CUSTOMER' ? subjectId : null;
    const leadId = subjectType === 'LEAD' ? subjectId : null;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRawUnsafe<Array<{ id: string; status: ContactPermissionStatus }>>(
        `SELECT id,status FROM crm_contact_channel_permissions
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
           AND customer_id IS NOT DISTINCT FROM $4::text
           AND lead_id IS NOT DISTINCT FROM $5::text
           AND channel=$6
         LIMIT 1 FOR UPDATE`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        customerId,
        leadId,
        channel,
      );

      let permissionId = existing[0]?.id;
      if (permissionId) {
        await tx.$executeRawUnsafe(
          `UPDATE crm_contact_channel_permissions
           SET status=$2,source=$3,reason=$4,changed_by_user_id=$5::text,changed_at=NOW(),updated_at=NOW()
           WHERE id=$1::text`,
          permissionId,
          status,
          source,
          reason,
          actorUserId,
        );
      } else {
        const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO crm_contact_channel_permissions(
             tenant_id,company_id,branch_id,customer_id,lead_id,channel,status,source,reason,changed_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10::text)
           RETURNING id`,
          scope.tenantId,
          scope.companyId,
          scope.branchId,
          customerId,
          leadId,
          channel,
          status,
          source,
          reason,
          actorUserId,
        );
        permissionId = inserted[0]?.id;
      }
      if (!permissionId) throw new BadRequestException('Contact permission could not be persisted.');

      await tx.$executeRawUnsafe(
        `INSERT INTO crm_contact_channel_permission_events(
           tenant_id,company_id,branch_id,permission_id,customer_id,lead_id,channel,previous_status,status,source,reason,actor_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12::text)`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        permissionId,
        customerId,
        leadId,
        channel,
        existing[0]?.status ?? null,
        status,
        source,
        reason,
        actorUserId,
      );

      return { id: permissionId, subjectType, subjectId, channel, status, source, reason };
    });
  }

  async canSendAutomation(
    scope: CrmAutomationScope & { branchId: string },
    subject: { leadId: string | null; opportunityId: string | null },
    channel: CrmMessageChannel,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ status: ContactPermissionStatus | null }>>(
      `SELECT COALESCE(cp.status,lp.status) AS status
       FROM (SELECT 1) seed
       LEFT JOIN crm_opportunities o
         ON o.id=$5::text AND o.tenant_id=$1::text AND o.company_id=$2::text AND o.branch_id=$3::text
       LEFT JOIN crm_contact_channel_permissions cp
         ON cp.tenant_id=$1::text AND cp.company_id=$2::text AND cp.branch_id=$3::text
        AND cp.customer_id=o.customer_id AND cp.channel=$6
       LEFT JOIN crm_contact_channel_permissions lp
         ON lp.tenant_id=$1::text AND lp.company_id=$2::text AND lp.branch_id=$3::text
        AND lp.lead_id=COALESCE($4::text,o.lead_id) AND lp.channel=$6
       LIMIT 1`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      subject.leadId,
      subject.opportunityId,
      channel,
    );
    const status = rows[0]?.status ?? null;
    return { allowed: status === 'OPTED_IN', status: (status ?? 'UNKNOWN') as ContactPermissionStatus };
  }

  private async assertSubject(
    context: { tenantId: string; companyId: string; branchId: string },
    subjectType: ContactSubjectType,
    subjectId: string,
  ) {
    const rows = subjectType === 'CUSTOMER'
      ? await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM customers WHERE id=$4::text AND "tenantId"=$1::text AND "branchId"=$3::text LIMIT 1`,
          context.tenantId,
          context.companyId,
          context.branchId,
          subjectId,
        )
      : await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM crm_leads WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`,
          context.tenantId,
          context.companyId,
          context.branchId,
          subjectId,
        );
    if (!rows[0]) throw new NotFoundException('CRM contact subject not found in active branch.');
  }
}
