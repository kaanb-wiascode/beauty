import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { CrmMessageProviderRegistryService } from './crm-message-provider-registry.service';
import type {
  CrmProviderWebhookEvent,
  CrmProviderWebhookRequest,
} from './crm-message-webhook.types';

@Injectable()
export class CrmMessageWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: CrmMessageProviderRegistryService,
  ) {}

  async handle(providerKey: string, request: CrmProviderWebhookRequest) {
    const provider = this.providers.resolveByKey(providerKey);
    if (!provider) throw new NotFoundException('Message provider not found.');
    if (!provider.verifyWebhook || !provider.parseWebhook) {
      throw new ServiceUnavailableException('Provider webhook adapter is not configured.');
    }
    if (!(await provider.verifyWebhook(request))) {
      throw new UnauthorizedException('Invalid provider webhook signature.');
    }

    const event = await provider.parseWebhook(request);
    this.validateEvent(event);

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO crm_message_webhook_events(
           tenant_id,company_id,branch_id,provider_key,external_event_id,event_type,external_message_id,outcome
         ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,'PROCESSED')
         ON CONFLICT(provider_key,external_event_id) DO NOTHING
         RETURNING id`,
        event.tenantId,
        event.companyId,
        event.branchId,
        provider.key,
        event.externalEventId,
        event.type,
        event.externalMessageId,
      );
      if (!claimed[0]) return { idempotent: true, outcome: 'DUPLICATE' as const };

      if (event.type === 'DELIVERY') {
        const rows = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
          `SELECT id,status FROM crm_messages
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
             AND provider_key=$4 AND external_message_id=$5
           LIMIT 1 FOR UPDATE`,
          event.tenantId,
          event.companyId,
          event.branchId,
          provider.key,
          event.externalMessageId,
        );
        const message = rows[0];
        if (!message) {
          await tx.$executeRawUnsafe(
            `UPDATE crm_message_webhook_events SET outcome='IGNORED',error_message='Message not found'
             WHERE id=$1::uuid`,
            claimed[0].id,
          );
          return { idempotent: false, outcome: 'IGNORED' as const };
        }

        const changed = await this.applyDelivery(tx, message.id, event);
        await tx.$executeRawUnsafe(
          `UPDATE crm_message_webhook_events SET message_id=$2::text,outcome=$3,error_message=$4 WHERE id=$1::uuid`,
          claimed[0].id,
          message.id,
          changed ? 'PROCESSED' : 'IGNORED',
          changed ? null : 'Status transition ignored',
        );
        return { idempotent: false, outcome: changed ? 'PROCESSED' as const : 'IGNORED' as const, messageId: message.id };
      }

      const hasSubject = Boolean(event.customerId || event.leadId || event.opportunityId);
      if (!hasSubject) {
        await tx.$executeRawUnsafe(
          `UPDATE crm_message_webhook_events SET outcome='IGNORED',error_message='Inbound subject is not mapped' WHERE id=$1::uuid`,
          claimed[0].id,
        );
        return { idempotent: false, outcome: 'IGNORED' as const };
      }

      const messages = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO crm_messages(
           tenant_id,company_id,branch_id,customer_id,lead_id,opportunity_id,direction,channel,status,
           provider_key,recipient,subject,body,external_message_id,created_by_user_id,sent_at,delivered_at
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'INBOUND',$7,'DELIVERED',
           $8,$9,$10,$11,$12,NULL,NOW(),NOW())
         RETURNING id`,
        event.tenantId,
        event.companyId,
        event.branchId,
        event.customerId ?? null,
        event.leadId ?? null,
        event.opportunityId ?? null,
        event.channel,
        provider.key,
        event.sender,
        event.subject?.trim() || null,
        event.body.trim(),
        event.externalMessageId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE crm_message_webhook_events SET message_id=$2::text WHERE id=$1::uuid`,
        claimed[0].id,
        messages[0].id,
      );
      return { idempotent: false, outcome: 'PROCESSED' as const, messageId: messages[0].id };
    });
  }

  private validateEvent(event: CrmProviderWebhookEvent) {
    if (!event.externalEventId?.trim() || !event.tenantId || !event.companyId || !event.branchId) {
      throw new BadRequestException('Provider webhook event is missing required scope or event id.');
    }
    if (event.type === 'INBOUND' && !event.body?.trim()) {
      throw new BadRequestException('Inbound message body is empty.');
    }
  }

  private async applyDelivery(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    messageId: string,
    event: Extract<CrmProviderWebhookEvent, { type: 'DELIVERY' }>,
  ) {
    const statusCondition = event.status === 'SENT'
      ? `status='QUEUED'`
      : event.status === 'DELIVERED'
        ? `status IN ('QUEUED','SENT')`
        : `status IN ('QUEUED','SENT')`;
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE crm_messages SET status=$2,
         sent_at=CASE WHEN $2 IN ('SENT','DELIVERED') THEN COALESCE(sent_at,NOW()) ELSE sent_at END,
         delivered_at=CASE WHEN $2='DELIVERED' THEN NOW() ELSE delivered_at END,
         error_message=CASE WHEN $2='FAILED' THEN $3 ELSE NULL END,
         version=version+1,updated_at=NOW()
       WHERE id=$1::text AND ${statusCondition}
       RETURNING id`,
      messageId,
      event.status,
      event.errorMessage?.slice(0, 1000) ?? null,
    );
    return Boolean(rows[0]);
  }
}
