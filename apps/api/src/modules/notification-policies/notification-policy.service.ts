import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type NotificationPolicyRow = {
  id: string;
  tenantId: string;
  companyId: string;
  eventKey: string;
  audience: string;
  channels: unknown;
  enabled: boolean;
  description: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

const SUPPORTED_CHANNELS = new Set(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP']);

@Injectable()
export class NotificationPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  async list() {
    const context = this.tenantContext.getContext();
    return this.prisma.$queryRaw<NotificationPolicyRow[]>`
      SELECT id,"tenantId","companyId","eventKey",audience,channels,enabled,description,
             "createdByUserId","createdAt","updatedAt"
      FROM admin_notification_policies
      WHERE "tenantId"=${context.tenantId} AND "companyId"=${context.companyId}
      ORDER BY "eventKey",audience
    `;
  }

  async upsert(input: {
    eventKey: string;
    audience: string;
    channels: string[];
    enabled?: boolean;
    description?: string;
  }) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();
    const eventKey = this.normalize(input.eventKey);
    const audience = this.normalize(input.audience);
    if (!eventKey || !audience) throw new BadRequestException('Event key and audience are required');
    const channels = [...new Set(input.channels.map((channel) => channel.trim().toUpperCase()))];
    if (!channels.length || channels.some((channel) => !SUPPORTED_CHANNELS.has(channel))) {
      throw new BadRequestException('At least one supported notification channel is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.$queryRaw<NotificationPolicyRow[]>`
        SELECT id,"tenantId","companyId","eventKey",audience,channels,enabled,description,
               "createdByUserId","createdAt","updatedAt"
        FROM admin_notification_policies
        WHERE "tenantId"=${context.tenantId} AND "companyId"=${context.companyId}
          AND "eventKey"=${eventKey} AND audience=${audience}
        LIMIT 1 FOR UPDATE
      `;
      const id = previous[0]?.id ?? randomUUID();
      const rows = await tx.$queryRaw<NotificationPolicyRow[]>`
        INSERT INTO admin_notification_policies(
          id,"tenantId","companyId","eventKey",audience,channels,enabled,description,"createdByUserId","createdAt","updatedAt"
        ) VALUES(
          ${id},${context.tenantId},${context.companyId},${eventKey},${audience},${JSON.stringify(channels)}::jsonb,
          ${input.enabled ?? true},${input.description?.trim() || null},${actorUserId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        )
        ON CONFLICT ("tenantId","companyId","eventKey",audience) DO UPDATE SET
          channels=EXCLUDED.channels,
          enabled=EXCLUDED.enabled,
          description=EXCLUDED.description,
          "updatedAt"=CURRENT_TIMESTAMP
        RETURNING id,"tenantId","companyId","eventKey",audience,channels,enabled,description,
                  "createdByUserId","createdAt","updatedAt"
      `;
      await this.audit.record({
        actorUserId,
        resource: 'notification_policies',
        action: previous.length ? 'update' : 'create',
        targetTenantId: context.tenantId,
        targetEntityType: 'notification_policy',
        targetEntityId: id,
        beforeState: previous[0] ?? null,
        afterState: rows[0],
        metadata: { companyId: context.companyId, eventKey, audience },
      }, tx);
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async actorUserId() {
    const context = this.tenantContext.getContext();
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: context.membershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });
    if (!membership) throw new BadRequestException('Active membership is required');
    return membership.userId;
  }

  private normalize(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  }
}
