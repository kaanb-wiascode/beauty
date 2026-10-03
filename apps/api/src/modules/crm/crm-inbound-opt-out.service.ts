import { Injectable } from '@nestjs/common';
import { Prisma } from '@beauty-erp/database';
import type { CrmProviderWebhookEvent } from './crm-message-webhook.types';

const OPT_OUT_KEYWORDS = new Set(['STOP', 'IPTAL', 'İPTAL', 'UNSUBSCRIBE', 'CANCEL', 'CIK', 'ÇIK']);

type InboundEvent = Extract<CrmProviderWebhookEvent, { type: 'INBOUND' }>;

@Injectable()
export class CrmInboundOptOutService {
  async apply(tx: Prisma.TransactionClient, event: InboundEvent) {
    const keyword = event.body.trim().toLocaleUpperCase('tr-TR');
    if (!OPT_OUT_KEYWORDS.has(keyword)) return false;

    let customerId = event.customerId ?? null;
    let leadId = event.leadId ?? null;
    if (!customerId && !leadId && event.opportunityId) {
      const opportunities = await tx.$queryRawUnsafe<Array<{ customerId: string | null; leadId: string | null }>>(
        `SELECT customer_id AS "customerId",lead_id AS "leadId"
         FROM crm_opportunities
         WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         LIMIT 1`,
        event.tenantId,
        event.companyId,
        event.branchId,
        event.opportunityId,
      );
      customerId = opportunities[0]?.customerId ?? null;
      leadId = customerId ? null : opportunities[0]?.leadId ?? null;
    }
    if (!customerId && !leadId) return false;

    const existing = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      `SELECT id,status FROM crm_contact_channel_permissions
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         AND customer_id IS NOT DISTINCT FROM $4::text
         AND lead_id IS NOT DISTINCT FROM $5::text
         AND channel=$6
       LIMIT 1 FOR UPDATE`,
      event.tenantId,
      event.companyId,
      event.branchId,
      customerId,
      leadId,
      event.channel,
    );

    let permissionId = existing[0]?.id;
    const reason = `Inbound opt-out keyword: ${keyword}`;
    if (permissionId) {
      await tx.$executeRawUnsafe(
        `UPDATE crm_contact_channel_permissions
         SET status='OPTED_OUT',source='INBOUND_KEYWORD',reason=$2,changed_by_user_id=NULL,changed_at=NOW(),updated_at=NOW()
         WHERE id=$1::text`,
        permissionId,
        reason,
      );
    } else {
      const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO crm_contact_channel_permissions(
           tenant_id,company_id,branch_id,customer_id,lead_id,channel,status,source,reason,changed_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,'OPTED_OUT','INBOUND_KEYWORD',$7,NULL)
         RETURNING id`,
        event.tenantId,
        event.companyId,
        event.branchId,
        customerId,
        leadId,
        event.channel,
        reason,
      );
      permissionId = inserted[0]?.id;
    }
    if (!permissionId) return false;

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_contact_channel_permission_events(
         tenant_id,company_id,branch_id,permission_id,customer_id,lead_id,channel,previous_status,status,source,reason,actor_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,'OPTED_OUT','INBOUND_KEYWORD',$9,NULL)`,
      event.tenantId,
      event.companyId,
      event.branchId,
      permissionId,
      customerId,
      leadId,
      event.channel,
      existing[0]?.status ?? null,
      reason,
    );
    return true;
  }
}
