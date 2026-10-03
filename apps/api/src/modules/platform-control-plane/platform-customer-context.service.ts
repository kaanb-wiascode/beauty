import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type CustomerContextRow = {
  tenantId: string;
  legalName: string | null;
  accountOwnerUserId: string | null;
  accountOwnerEmail: string | null;
  customerSuccessOwnerUserId: string | null;
  customerSuccessOwnerEmail: string | null;
  goLiveAt: Date | null;
  renewalAt: Date | null;
  updatedAt: Date;
};

type CustomerNoteRow = {
  id: string;
  authorUserId: string;
  authorEmail: string | null;
  body: string;
  createdAt: Date;
};

@Injectable()
export class PlatformCustomerContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async get(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const accountRows = await this.prisma.$queryRaw<CustomerContextRow[]>`
      SELECT
        pca.tenant_id AS "tenantId",
        pca.legal_name AS "legalName",
        pca.account_owner_user_id AS "accountOwnerUserId",
        ao.email AS "accountOwnerEmail",
        pca.customer_success_owner_user_id AS "customerSuccessOwnerUserId",
        cs.email AS "customerSuccessOwnerEmail",
        pca.go_live_at AS "goLiveAt",
        pca.renewal_at AS "renewalAt",
        pca.updated_at AS "updatedAt"
      FROM platform_customer_accounts pca
      LEFT JOIN users ao ON ao.id = pca.account_owner_user_id
      LEFT JOIN users cs ON cs.id = pca.customer_success_owner_user_id
      WHERE pca.tenant_id = ${tenantId}
      LIMIT 1
    `;
    const notes = await this.prisma.$queryRaw<CustomerNoteRow[]>`
      SELECT
        n.id,
        n.author_user_id AS "authorUserId",
        u.email AS "authorEmail",
        n.body,
        n.created_at AS "createdAt"
      FROM platform_customer_notes n
      LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.tenant_id = ${tenantId}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 50
    `;
    return { account: accountRows[0] ?? null, notes };
  }

  async updateAccount(
    actorUserId: string,
    tenantId: string,
    input: {
      legalName?: string | null;
      accountOwnerUserId?: string | null;
      customerSuccessOwnerUserId?: string | null;
      goLiveAt?: string | null;
      renewalAt?: string | null;
    },
  ) {
    await this.assertTenantExists(tenantId);
    if (input.accountOwnerUserId) await this.assertActivePlatformAdmin(input.accountOwnerUserId);
    if (input.customerSuccessOwnerUserId) await this.assertActivePlatformAdmin(input.customerSuccessOwnerUserId);
    const before = (await this.get(tenantId)).account;
    const legalName = input.legalName === undefined ? before?.legalName ?? null : this.cleanText(input.legalName, 250);
    const accountOwnerUserId = input.accountOwnerUserId === undefined ? before?.accountOwnerUserId ?? null : input.accountOwnerUserId;
    const customerSuccessOwnerUserId = input.customerSuccessOwnerUserId === undefined ? before?.customerSuccessOwnerUserId ?? null : input.customerSuccessOwnerUserId;
    const goLiveAt = input.goLiveAt === undefined ? before?.goLiveAt ?? null : this.parseDate(input.goLiveAt);
    const renewalAt = input.renewalAt === undefined ? before?.renewalAt ?? null : this.parseDate(input.renewalAt);

    await this.prisma.$executeRaw`
      INSERT INTO platform_customer_accounts (
        tenant_id, legal_name, account_owner_user_id, customer_success_owner_user_id, go_live_at, renewal_at, updated_at
      ) VALUES (
        ${tenantId}, ${legalName}, ${accountOwnerUserId}, ${customerSuccessOwnerUserId}, ${goLiveAt}, ${renewalAt}, NOW()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        account_owner_user_id = EXCLUDED.account_owner_user_id,
        customer_success_owner_user_id = EXCLUDED.customer_success_owner_user_id,
        go_live_at = EXCLUDED.go_live_at,
        renewal_at = EXCLUDED.renewal_at,
        updated_at = NOW()
    `;
    const after = (await this.get(tenantId)).account;
    await this.audit.record({
      actorUserId,
      resource: 'customers',
      action: 'context.update',
      targetTenantId: tenantId,
      targetEntityType: 'tenant',
      targetEntityId: tenantId,
      beforeState: before,
      afterState: after,
    });
    return after;
  }

  async addNote(actorUserId: string, tenantId: string, body: string) {
    await this.assertTenantExists(tenantId);
    const normalized = body.trim();
    if (!normalized || normalized.length > 4000) {
      throw new BadRequestException('Internal note must contain between 1 and 4000 characters.');
    }
    const rows = await this.prisma.$queryRaw<CustomerNoteRow[]>`
      INSERT INTO platform_customer_notes (tenant_id, author_user_id, body)
      VALUES (${tenantId}, ${actorUserId}, ${normalized})
      RETURNING id, author_user_id AS "authorUserId", NULL::text AS "authorEmail", body, created_at AS "createdAt"
    `;
    const note = rows[0];
    await this.audit.record({
      actorUserId,
      resource: 'customers',
      action: 'note.add',
      targetTenantId: tenantId,
      targetEntityType: 'customer_note',
      targetEntityId: note?.id ?? null,
      afterState: note,
    });
    return note;
  }

  private async assertTenantExists(tenantId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Platform customer tenant was not found.');
  }

  private async assertActivePlatformAdmin(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT pau.user_id AS "userId"
      FROM platform_admin_users pau
      WHERE pau.user_id = ${userId} AND pau.status = 'ACTIVE'
      LIMIT 1
    `;
    if (!rows[0]) throw new BadRequestException('Assigned owner must be an active platform administrator.');
  }

  private cleanText(value: string | null, max: number) {
    if (value === null) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > max) throw new BadRequestException(`Value must not exceed ${max} characters.`);
    return normalized;
  }

  private parseDate(value: string | null) {
    if (value === null || value.trim() === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date value.');
    return date;
  }
}
