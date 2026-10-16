import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CrmMessageWebhookHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  list(limit = 50) {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.prisma.$queryRawUnsafe(
      `SELECT e.id,e.provider_key AS "providerKey",e.external_event_id AS "externalEventId",
              e.event_type AS "eventType",e.external_message_id AS "externalMessageId",
              e.message_id AS "messageId",e.outcome,e.error_message AS "errorMessage",
              e.received_at AS "receivedAt",m.channel,m.status AS "messageStatus"
       FROM crm_message_webhook_events e
       LEFT JOIN crm_messages m ON m.id=e.message_id
       WHERE e.tenant_id=$1::text AND e.company_id=$2::text AND e.branch_id=$3::text
       ORDER BY e.received_at DESC,e.id DESC
       LIMIT $4`,
      context.tenantId,
      context.companyId,
      context.branchId,
      safeLimit,
    );
  }
}
