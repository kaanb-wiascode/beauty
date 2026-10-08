import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmInboundOptOutService } from './crm-inbound-opt-out.service';

type InboxRow = {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string;
  providerKey: string;
  externalEventId: string;
  externalMessageId: string | null;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  sender: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
};

@Injectable()
export class CrmUnresolvedInboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly optOut: CrmInboundOptOutService,
  ) {}

  list(status: 'OPEN' | 'RESOLVED' | 'DISMISSED' | 'ALL' = 'OPEN', limit = 100) {
    const context = this.context();
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.prisma.$queryRawUnsafe(
      `SELECT id,provider_key AS "providerKey",external_event_id AS "externalEventId",
              external_message_id AS "externalMessageId",channel,sender,recipient,subject,body,status,
              customer_id AS "customerId",lead_id AS "leadId",resolution_note AS "resolutionNote",
              resolved_at AS "resolvedAt",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM crm_unresolved_inbound_messages
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         AND ($4='ALL' OR status=$4)
       ORDER BY CASE WHEN status='OPEN' THEN 0 ELSE 1 END,created_at DESC,id DESC
       LIMIT $5`,
      context.tenantId,
      context.companyId,
      context.branchId,
      status,
      safeLimit,
    );
  }

  async resolve(
    id: string,
    subjectType: 'CUSTOMER' | 'LEAD',
    subjectId: string,
    note: string | null,
    actorUserId: string,
  ) {
    const context = this.context();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, context, id);
      if (row.status !== 'OPEN') throw new ConflictException('Inbound inbox item is already closed.');
      await this.assertSubject(tx, context, subjectType, subjectId);
      return this.resolveLocked(
        tx,
        row,
        subjectType === 'CUSTOMER' ? subjectId : null,
        subjectType === 'LEAD' ? subjectId : null,
        note,
        actorUserId,
      );
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createLead(
    id: string,
    input: { firstName: string; lastName: string },
    actorUserId: string,
  ) {
    const context = this.context();
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lock(tx, context, id);
      if (row.status !== 'OPEN') throw new ConflictException('Inbound inbox item is already closed.');
      const contactColumn = row.channel === 'EMAIL' ? 'email' : 'phone';
      const leads = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO crm_leads(
           tenant_id,company_id,branch_id,first_name,last_name,phone,email,source,status,interest_note,created_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,'INBOUND_MESSAGE','NEW',$8,$9::text)
         RETURNING id`,
        context.tenantId,
        context.companyId,
        context.branchId,
        input.firstName.trim(),
        input.lastName.trim(),
        contactColumn === 'phone' ? row.sender : null,
        contactColumn === 'email' ? row.sender : null,
        row.body.slice(0, 2000),
        actorUserId,
      );
      const leadId = leads[0]?.id;
      if (!leadId) throw new BadRequestException('Lead could not be created.');
      const resolution = await this.resolveLocked(tx, row, null, leadId, 'Inbound inbox üzerinden Lead oluşturuldu.', actorUserId);
      return { ...resolution, leadId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async dismiss(id: string, reason: string, actorUserId: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE crm_unresolved_inbound_messages
       SET status='DISMISSED',resolved_by_user_id=$5::text,resolution_note=$6,resolved_at=NOW(),updated_at=NOW()
       WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND status='OPEN'
       RETURNING id`,
      context.tenantId,
      context.companyId,
      context.branchId,
      id,
      actorUserId,
      reason.trim(),
    );
    if (!rows[0]) throw new NotFoundException('Open inbound inbox item not found.');
    return { id, status: 'DISMISSED' as const };
  }

  private context() {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    return { tenantId: context.tenantId, companyId: context.companyId, branchId: context.branchId };
  }

  private async lock(
    tx: Prisma.TransactionClient,
    context: { tenantId: string; companyId: string; branchId: string },
    id: string,
  ) {
    const rows = await tx.$queryRawUnsafe<InboxRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",
              provider_key AS "providerKey",external_event_id AS "externalEventId",
              external_message_id AS "externalMessageId",channel,sender,recipient,subject,body,status
       FROM crm_unresolved_inbound_messages
       WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
       LIMIT 1 FOR UPDATE`,
      context.tenantId,
      context.companyId,
      context.branchId,
      id,
    );
    if (!rows[0]) throw new NotFoundException('Inbound inbox item not found.');
    return rows[0];
  }

  private async assertSubject(
    tx: Prisma.TransactionClient,
    context: { tenantId: string; companyId: string; branchId: string },
    subjectType: 'CUSTOMER' | 'LEAD',
    subjectId: string,
  ) {
    const rows = subjectType === 'CUSTOMER'
      ? await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM customers WHERE id=$4::text AND "tenantId"=$1::text AND "branchId"=$3::text LIMIT 1`,
          context.tenantId,
          context.companyId,
          context.branchId,
          subjectId,
        )
      : await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM crm_leads WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`,
          context.tenantId,
          context.companyId,
          context.branchId,
          subjectId,
        );
    if (!rows[0]) throw new NotFoundException('CRM subject not found in active branch.');
  }

  private async resolveLocked(
    tx: Prisma.TransactionClient,
    row: InboxRow,
    customerId: string | null,
    leadId: string | null,
    note: string | null,
    actorUserId: string,
  ) {
    const messages = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO crm_messages(
         tenant_id,company_id,branch_id,customer_id,lead_id,direction,channel,status,provider_key,
         recipient,subject,body,external_message_id,created_by_user_id,sent_at,delivered_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'INBOUND',$6,'DELIVERED',$7,$8,$9,$10,$11,NULL,NOW(),NOW())
       ON CONFLICT(tenant_id,company_id,branch_id,provider_key,external_message_id)
         WHERE provider_key IS NOT NULL AND external_message_id IS NOT NULL
       DO NOTHING RETURNING id`,
      row.tenantId,
      row.companyId,
      row.branchId,
      customerId,
      leadId,
      row.channel,
      row.providerKey,
      row.sender,
      row.subject,
      row.body,
      row.externalMessageId,
    );
    let messageId = messages[0]?.id;
    if (!messageId && row.externalMessageId) {
      const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM crm_messages
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
           AND provider_key=$4 AND external_message_id=$5 LIMIT 1`,
        row.tenantId,
        row.companyId,
        row.branchId,
        row.providerKey,
        row.externalMessageId,
      );
      messageId = existing[0]?.id;
    }
    if (!messageId) throw new BadRequestException('Inbound CRM message could not be materialized.');

    await this.optOut.apply(tx, {
      type: 'INBOUND',
      tenantId: row.tenantId,
      companyId: row.companyId,
      branchId: row.branchId,
      externalEventId: row.externalEventId,
      externalMessageId: row.externalMessageId ?? row.externalEventId,
      channel: row.channel,
      sender: row.sender,
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      customerId,
      leadId,
    });

    await tx.$executeRawUnsafe(
      `UPDATE crm_unresolved_inbound_messages
       SET status='RESOLVED',customer_id=$2::text,lead_id=$3::text,resolved_by_user_id=$4::text,
           resolution_note=$5,resolved_at=NOW(),updated_at=NOW()
       WHERE id=$1::text`,
      row.id,
      customerId,
      leadId,
      actorUserId,
      note,
    );
    await tx.$executeRawUnsafe(
      `UPDATE crm_message_webhook_events
       SET message_id=$6::text,outcome='PROCESSED',error_message=NULL,processed_at=NOW()
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         AND provider_key=$4 AND external_event_id=$5`,
      row.tenantId,
      row.companyId,
      row.branchId,
      row.providerKey,
      row.externalEventId,
      messageId,
    );
    return { id: row.id, status: 'RESOLVED' as const, messageId, customerId, leadId };
  }
}