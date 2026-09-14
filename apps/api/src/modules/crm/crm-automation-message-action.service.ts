import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { CrmAutomationRulesService } from './crm-automation-rules.service';
import type { CrmAutomationScope } from './crm-automation.service';
import { CrmMessageProviderRegistryService, type CrmMessageChannel } from './crm-message-provider-registry.service';

type Marker = { id: string; branchId: string; leadId: string | null; opportunityId: string | null; actorUserId: string; ruleKey: 'LEAD_FIRST_TOUCH' | 'OPPORTUNITY_STAGE_FOLLOW_UP' };

@Injectable()
export class CrmAutomationMessageActionService {
  constructor(private readonly prisma: PrismaService, private readonly rules: CrmAutomationRulesService, private readonly providers: CrmMessageProviderRegistryService) {}

  async process(scope: CrmAutomationScope) {
    const markers = await this.prisma.$queryRawUnsafe<Marker[]>(
      `SELECT e.id,e.branch_id AS "branchId",e.lead_id AS "leadId",e.opportunity_id AS "opportunityId",e.actor_user_id AS "actorUserId",e.metadata->>'rule' AS "ruleKey"
       FROM crm_events e
       WHERE e.tenant_id=$1::text AND e.company_id=$2::text AND ($3::text IS NULL OR e.branch_id=$3::text)
         AND e.event_type='AUTOMATION_EXECUTED' AND e.metadata->>'markerOnly'='true'
         AND e.metadata->>'rule' IN ('LEAD_FIRST_TOUCH','OPPORTUNITY_STAGE_FOLLOW_UP')
         AND NOT EXISTS (SELECT 1 FROM crm_events m WHERE m.tenant_id=e.tenant_id AND m.company_id=e.company_id AND m.branch_id=e.branch_id AND m.event_type='AUTOMATION_EXECUTED' AND m.metadata->>'messageSourceEventId'=e.id::text)
       ORDER BY e.created_at,e.id LIMIT 100`,
      scope.tenantId, scope.companyId, scope.branchId,
    );
    let sent = 0, failed = 0, skipped = 0;
    for (const marker of markers) {
      const rowScope = { ...scope, branchId: marker.branchId };
      const rule = await this.rules.get(rowScope, marker.ruleKey);
      if (rule.config.messageEnabled !== true) { await this.mark(marker,rowScope,'DISABLED'); skipped++; continue; }
      const channel = String(rule.config.messageChannel ?? 'WHATSAPP') as CrmMessageChannel;
      const body = String(rule.config.messageTemplate ?? '').trim();
      if (!['WHATSAPP','SMS','EMAIL'].includes(channel) || !body) { await this.mark(marker,rowScope,'INVALID_CONFIG'); skipped++; continue; }
      const recipient = await this.recipient(marker,rowScope,channel);
      if (!recipient) { await this.mark(marker,rowScope,'NO_RECIPIENT'); skipped++; continue; }
      const outcome = await this.deliver(marker,rowScope,channel,recipient,body);
      if (outcome === 'SENT') sent++; else failed++;
    }
    return { scanned: markers.length, sent, failed, skipped };
  }

  private async recipient(marker: Marker, scope: CrmAutomationScope & { branchId: string }, channel: CrmMessageChannel) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ phone: string | null; email: string | null }>>(
      `SELECT COALESCE(l.phone,c.phone,ol.phone) AS phone,COALESCE(l.email,c.email,ol.email) AS email
       FROM (SELECT 1) seed
       LEFT JOIN crm_leads l ON l.id=$4::text AND l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text
       LEFT JOIN crm_opportunities o ON o.id=$5::text AND o.tenant_id=$1::text AND o.company_id=$2::text AND o.branch_id=$3::text
       LEFT JOIN customers c ON c.id=o.customer_id AND c."tenantId"=$1::text AND c."branchId"=$3::text
       LEFT JOIN crm_leads ol ON ol.id=o.lead_id AND ol.tenant_id=$1::text AND ol.company_id=$2::text AND ol.branch_id=$3::text LIMIT 1`,
      scope.tenantId,scope.companyId,scope.branchId,marker.leadId,marker.opportunityId,
    );
    return channel === 'EMAIL' ? rows[0]?.email?.trim() || null : rows[0]?.phone?.trim() || null;
  }

  private async deliver(marker: Marker, scope: CrmAutomationScope & { branchId: string }, channel: CrmMessageChannel, recipient: string, body: string) {
    const key = `AUTO_MESSAGE:${marker.id}`;
    const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_messages WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND idempotency_key=$4 LIMIT 1`,
      scope.tenantId,scope.companyId,scope.branchId,key,
    );
    let messageId = existing[0]?.id;
    if (!messageId) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO crm_messages(tenant_id,company_id,branch_id,lead_id,opportunity_id,direction,channel,status,recipient,body,idempotency_key,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'OUTBOUND',$6,'DRAFT',$7,$8,$9,$10::text)
         ON CONFLICT(tenant_id,company_id,branch_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id`,
        scope.tenantId,scope.companyId,scope.branchId,marker.leadId,marker.opportunityId,channel,recipient,body,key,marker.actorUserId,
      );
      messageId = rows[0]?.id;
    }
    if (!messageId) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM crm_messages WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND idempotency_key=$4 LIMIT 1`,scope.tenantId,scope.companyId,scope.branchId,key);
      messageId = rows[0]?.id;
    }
    if (!messageId) { await this.mark(marker,scope,'MESSAGE_CREATE_FAILED'); return 'FAILED' as const; }
    const provider = this.providers.resolve(channel);
    if (!provider) { await this.failMessage(messageId,'No configured provider is available.'); await this.mark(marker,scope,'PROVIDER_UNAVAILABLE',messageId); return 'FAILED' as const; }
    try {
      await this.prisma.$executeRawUnsafe(`UPDATE crm_messages SET status='QUEUED',provider_key=$2,version=version+1,updated_at=NOW() WHERE id=$1::text AND status IN ('DRAFT','FAILED')`,messageId,provider.key);
      const result = await provider.send({ messageId, channel, recipient, body, idempotencyKey: key });
      await this.prisma.$executeRawUnsafe(`UPDATE crm_messages SET status=$2,external_message_id=$3,sent_at=CASE WHEN $2='SENT' THEN NOW() ELSE sent_at END,version=version+1,updated_at=NOW() WHERE id=$1::text`,messageId,result.status,result.externalMessageId);
      await this.mark(marker,scope,'SENT',messageId); return 'SENT' as const;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0,1000) : 'Provider send failed.';
      await this.failMessage(messageId,message); await this.mark(marker,scope,'FAILED',messageId); return 'FAILED' as const;
    }
  }

  private failMessage(id: string, error: string) { return this.prisma.$executeRawUnsafe(`UPDATE crm_messages SET status='FAILED',error_message=$2,version=version+1,updated_at=NOW() WHERE id=$1::text`,id,error); }

  private mark(marker: Marker, scope: CrmAutomationScope & { branchId: string }, outcome: string, messageId?: string) {
    return this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,opportunity_id,event_type,actor_user_id,metadata)
       VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'AUTOMATION_EXECUTED',$6::text,$7::jsonb)`,
      scope.tenantId,scope.companyId,scope.branchId,marker.leadId,marker.opportunityId,marker.actorUserId,
      JSON.stringify({ messageSourceEventId: marker.id, automationKey: `AUTO_MESSAGE:${marker.id}`, rule: marker.ruleKey, messageId: messageId ?? null, outcome }),
    );
  }
}
