import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmCommunicationComplianceService } from './crm-communication-compliance.service';
import {
  CrmMessageChannel,
  CrmMessageProviderRegistryService,
} from './crm-message-provider-registry.service';

export type CrmMessageDirection = 'INBOUND' | 'OUTBOUND';

type MessageSubject = {
  customerId?: string;
  leadId?: string;
  opportunityId?: string;
};

type MessageRow = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  direction: CrmMessageDirection;
  channel: CrmMessageChannel;
  status: string;
  providerKey: string | null;
  recipient: string;
  subject: string | null;
  body: string;
  idempotencyKey: string | null;
  externalMessageId: string | null;
  errorMessage: string | null;
  version: number;
  createdByUserId: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CrmMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly providers: CrmMessageProviderRegistryService,
    private readonly compliance: CrmCommunicationComplianceService,
  ) {}

  private scope() {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    return { tenantId: context.tenantId, companyId: context.companyId, branchId: context.branchId };
  }

  list(input: MessageSubject & { limit?: number }) {
    const scope = this.scope();
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<MessageRow[]>(
      `SELECT id, customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",
              direction,channel,status,provider_key AS "providerKey",recipient,subject,body,
              idempotency_key AS "idempotencyKey",external_message_id AS "externalMessageId",
              error_message AS "errorMessage",version,created_by_user_id AS "createdByUserId",
              sent_at AS "sentAt",delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM crm_messages
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         AND ($4::text IS NULL OR customer_id=$4::text)
         AND ($5::text IS NULL OR lead_id=$5::text)
         AND ($6::text IS NULL OR opportunity_id=$6::text)
       ORDER BY created_at DESC,id DESC LIMIT $7`,
      scope.tenantId, scope.companyId, scope.branchId,
      input.customerId ?? null, input.leadId ?? null, input.opportunityId ?? null, limit,
    );
  }

  providerStatus() {
    const providers = this.providers.list();
    const registeredChannels = Array.from(new Set(providers.flatMap((provider) => provider.channels))) as CrmMessageChannel[];
    return {
      providers,
      supportedChannels: ['EMAIL', 'SMS', 'WHATSAPP'] as CrmMessageChannel[],
      registeredChannels,
    };
  }

  async logManual(input: MessageSubject & { direction: CrmMessageDirection; channel: CrmMessageChannel; recipient?: string; subject?: string; body: string }, actorUserId: string) {
    const scope = this.scope();
    const recipient = input.recipient?.trim() || await this.resolveRecipient(input, input.channel);
    const delivered = input.direction === 'INBOUND';
    const rows = await this.prisma.$queryRawUnsafe<MessageRow[]>(
      `INSERT INTO crm_messages(tenant_id,company_id,branch_id,customer_id,lead_id,opportunity_id,direction,channel,status,provider_key,recipient,subject,body,created_by_user_id,sent_at,delivered_at)
       VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,'MANUAL',$10,$11,$12,$13::text,NOW(),$14)
       RETURNING id,customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",direction,channel,status,provider_key AS "providerKey",recipient,subject,body,idempotency_key AS "idempotencyKey",external_message_id AS "externalMessageId",error_message AS "errorMessage",version,created_by_user_id AS "createdByUserId",sent_at AS "sentAt",delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt"`,
      scope.tenantId, scope.companyId, scope.branchId, input.customerId ?? null, input.leadId ?? null, input.opportunityId ?? null,
      input.direction, input.channel, delivered ? 'DELIVERED' : 'SENT', recipient, input.subject?.trim() || null, input.body.trim(), actorUserId, delivered ? new Date() : null,
    );
    return rows[0];
  }

  async createDraft(input: MessageSubject & { channel: CrmMessageChannel; providerKey?: string; recipient?: string; subject?: string; body: string; idempotencyKey?: string }, actorUserId: string) {
    const scope = this.scope();
    const recipient = input.recipient?.trim() || await this.resolveRecipient(input, input.channel);
    try {
      const rows = await this.prisma.$queryRawUnsafe<MessageRow[]>(
        `INSERT INTO crm_messages(tenant_id,company_id,branch_id,customer_id,lead_id,opportunity_id,direction,channel,status,provider_key,recipient,subject,body,idempotency_key,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'OUTBOUND',$7,'DRAFT',$8,$9,$10,$11,$12,$13::text)
         RETURNING id,customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",direction,channel,status,provider_key AS "providerKey",recipient,subject,body,idempotency_key AS "idempotencyKey",external_message_id AS "externalMessageId",error_message AS "errorMessage",version,created_by_user_id AS "createdByUserId",sent_at AS "sentAt",delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt"`,
        scope.tenantId, scope.companyId, scope.branchId, input.customerId ?? null, input.leadId ?? null, input.opportunityId ?? null,
        input.channel, input.providerKey?.trim() || null, recipient, input.subject?.trim() || null, input.body.trim(), input.idempotencyKey?.trim() || null, actorUserId,
      );
      return rows[0];
    } catch (error) {
      if (input.idempotencyKey && String(error).includes('crm_messages_idempotency_unique')) {
        const existing = await this.findByIdempotency(scope, input.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async send(id: string, expectedVersion: number) {
    const scope = this.scope();
    const existing = await this.get(id);
    if (existing.direction !== 'OUTBOUND') throw new BadRequestException('Inbound messages cannot be sent.');
    if (!['DRAFT', 'FAILED'].includes(existing.status)) throw new ConflictException('Message is not sendable in its current status.');
    const consent = await this.compliance.canSendManual(scope, { customerId: existing.customerId, leadId: existing.leadId, opportunityId: existing.opportunityId }, existing.channel);
    if (!consent.allowed) throw new ForbiddenException(`Contact opted out of ${existing.channel} communications.`);
    const provider = this.providers.resolve(existing.channel, existing.providerKey);
    if (!provider) throw new ServiceUnavailableException(`No configured provider is available for ${existing.channel}.`);
    const claimed = await this.prisma.$queryRawUnsafe<MessageRow[]>(
      `UPDATE crm_messages SET status='QUEUED',provider_key=$6,version=version+1,error_message=NULL,updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text AND version=$5::int AND status IN ('DRAFT','FAILED')
       RETURNING id,customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",direction,channel,status,provider_key AS "providerKey",recipient,subject,body,idempotency_key AS "idempotencyKey",external_message_id AS "externalMessageId",error_message AS "errorMessage",version,created_by_user_id AS "createdByUserId",sent_at AS "sentAt",delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt"`,
      id, scope.tenantId, scope.companyId, scope.branchId, expectedVersion, provider.key,
    );
    if (!claimed[0]) throw new ConflictException('Message version/status changed.');
    try {
      const result = await provider.send({ messageId: id, channel: existing.channel, recipient: existing.recipient, subject: existing.subject, body: existing.body, idempotencyKey: existing.idempotencyKey });
      const rows = await this.prisma.$queryRawUnsafe<MessageRow[]>(
        `UPDATE crm_messages SET status=$5,external_message_id=$6,sent_at=CASE WHEN $5='SENT' THEN NOW() ELSE sent_at END,version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
         RETURNING id,customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",direction,channel,status,provider_key AS "providerKey",recipient,subject,body,idempotency_key AS "idempotencyKey",external_message_id AS "externalMessageId",error_message AS "errorMessage",version,created_by_user_id AS "createdByUserId",sent_at AS "sentAt",delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt"`,
        id, scope.tenantId, scope.companyId, scope.branchId, result.status, result.externalMessageId,
      );
      return rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Provider send failed.';
      await this.prisma.$executeRawUnsafe(`UPDATE crm_messages SET status='FAILED',error_message=$5,version=version+1,updated_at=NOW() WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text`, id, scope.tenantId, scope.companyId, scope.branchId, message);
      throw new ServiceUnavailableException(message);
    }
  }

  async get(id: string) {
    const scope = this.scope();
    const rows = await this.prisma.$queryRawUnsafe<MessageRow[]>(
      `SELECT id,customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",direction,channel,status,provider_key AS "providerKey",recipient,subject,body,idempotency_key AS "idempotencyKey",external_message_id AS "externalMessageId",error_message AS "errorMessage",version,created_by_user_id AS "createdByUserId",sent_at AS "sentAt",delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM crm_messages WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text LIMIT 1`,
      id, scope.tenantId, scope.companyId, scope.branchId,
    );
    if (!rows[0]) throw new NotFoundException('Message not found.');
    return rows[0];
  }

  private async findByIdempotency(scope: { tenantId: string; companyId: string; branchId: string }, idempotencyKey: string) {
    const rows = await this.prisma.$queryRawUnsafe<MessageRow[]>(
      `SELECT id,customer_id AS "customerId",lead_id AS "leadId",opportunity_id AS "opportunityId",direction,channel,status,provider_key AS "providerKey",recipient,subject,body,idempotency_key AS "idempotencyKey",external_message_id AS "externalMessageId",error_message AS "errorMessage",version,created_by_user_id AS "createdByUserId",sent_at AS "sentAt",delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM crm_messages WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND idempotency_key=$4 LIMIT 1`,
      scope.tenantId, scope.companyId, scope.branchId, idempotencyKey,
    );
    return rows[0] ?? null;
  }

  private async resolveRecipient(subject: MessageSubject, channel: CrmMessageChannel) {
    const scope = this.scope();
    if (!subject.customerId && !subject.leadId && !subject.opportunityId) throw new BadRequestException('A customer, lead, or opportunity subject is required.');
    const rows = await this.prisma.$queryRawUnsafe<Array<{ phone: string | null; email: string | null }>>(
      `SELECT COALESCE(c.phone,l.phone,oc.phone,ol.phone) AS phone, COALESCE(c.email,l.email,oc.email,ol.email) AS email
       FROM (SELECT 1) seed
       LEFT JOIN customers c ON c.id=$4::text AND c."tenantId"=$1::text AND c."branchId"=$3::text
       LEFT JOIN crm_leads l ON l.id=$5::text AND l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text
       LEFT JOIN crm_opportunities o ON o.id=$6::text AND o.tenant_id=$1::text AND o.company_id=$2::text AND o.branch_id=$3::text
       LEFT JOIN customers oc ON oc.id=o.customer_id AND oc."tenantId"=$1::text AND oc."branchId"=$3::text
       LEFT JOIN crm_leads ol ON ol.id=o.lead_id AND ol.tenant_id=$1::text AND ol.company_id=$2::text AND ol.branch_id=$3::text LIMIT 1`,
      scope.tenantId, scope.companyId, scope.branchId, subject.customerId ?? null, subject.leadId ?? null, subject.opportunityId ?? null,
    );
    const value = channel === 'EMAIL' ? rows[0]?.email : rows[0]?.phone;
    if (!value) throw new BadRequestException(channel === 'EMAIL' ? 'No e-mail address is available for this CRM subject.' : 'No phone number is available for this CRM subject.');
    return value;
  }
}
