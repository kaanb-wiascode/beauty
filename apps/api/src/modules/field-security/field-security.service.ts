import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type FieldPolicyRow = {
  id: string;
  tenantId: string;
  companyId: string;
  fieldGroup: string;
  requiredResource: string;
  requiredAction: string;
  description: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class FieldSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  list() {
    const context = this.tenantContext.getContext();
    return this.prisma.$queryRaw<FieldPolicyRow[]>`
      SELECT *
      FROM field_security_policies
      WHERE "tenantId" = ${context.tenantId}
        AND "companyId" = ${context.companyId}
      ORDER BY "fieldGroup"
    `;
  }

  async upsert(input: {
    fieldGroup: string;
    requiredResource: string;
    requiredAction: string;
    description?: string;
  }) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();
    const fieldGroup = this.normalize(input.fieldGroup);
    const requiredResource = this.normalize(input.requiredResource);
    const requiredAction = this.normalize(input.requiredAction);
    if (!fieldGroup || !requiredResource || !requiredAction) {
      throw new BadRequestException('Field group and required permission are required');
    }

    const permission = await this.prisma.permission.findUnique({
      where: { resource_action: { resource: requiredResource, action: requiredAction } },
      select: { id: true },
    });
    if (!permission) throw new BadRequestException('Required permission does not exist');

    const previous = await this.prisma.$queryRaw<FieldPolicyRow[]>`
      SELECT * FROM field_security_policies
      WHERE "tenantId"=${context.tenantId}
        AND "companyId"=${context.companyId}
        AND "fieldGroup"=${fieldGroup}
      LIMIT 1
    `;

    const id = previous[0]?.id ?? randomUUID();
    const rows = await this.prisma.$queryRaw<FieldPolicyRow[]>`
      INSERT INTO field_security_policies(
        id,"tenantId","companyId","fieldGroup","requiredResource","requiredAction",description,"createdByUserId","createdAt","updatedAt"
      ) VALUES(
        ${id},${context.tenantId},${context.companyId},${fieldGroup},${requiredResource},${requiredAction},${input.description?.trim() || null},${actorUserId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      )
      ON CONFLICT ("tenantId","companyId","fieldGroup") DO UPDATE SET
        "requiredResource"=EXCLUDED."requiredResource",
        "requiredAction"=EXCLUDED."requiredAction",
        description=EXCLUDED.description,
        "updatedAt"=CURRENT_TIMESTAMP
      RETURNING *
    `;

    await this.audit.record({
      actorUserId,
      resource: 'field_security',
      action: previous.length ? 'update' : 'create',
      targetTenantId: context.tenantId,
      targetEntityType: 'field_security_policy',
      targetEntityId: id,
      beforeState: previous[0] ?? null,
      afterState: rows[0],
      metadata: { companyId: context.companyId, fieldGroup },
    });
    return rows[0];
  }

  async canRead(
    fieldGroup: string,
    fallback: { resource: string; action: string },
  ) {
    const context = this.tenantContext.getContext();
    const normalized = this.normalize(fieldGroup);
    const rows = await this.prisma.$queryRaw<Array<{ requiredResource: string; requiredAction: string }>>`
      SELECT "requiredResource","requiredAction"
      FROM field_security_policies
      WHERE "tenantId"=${context.tenantId}
        AND "companyId"=${context.companyId}
        AND "fieldGroup"=${normalized}
      LIMIT 1
    `;
    const required = rows[0] ?? {
      requiredResource: fallback.resource,
      requiredAction: fallback.action,
    };

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: context.membershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      select: { id: true, roleId: true },
    });
    if (!membership) return false;

    const roleGrant = await this.prisma.rolePermission.count({
      where: {
        roleId: membership.roleId,
        permission: {
          resource: required.requiredResource,
          action: required.requiredAction,
        },
      },
    });
    if (roleGrant > 0) return true;

    const temporary = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT g.id
      FROM temporary_permission_grants g
      JOIN permissions p ON p.id=g."permissionId"
      WHERE g."tenantId"=${context.tenantId}
        AND g."companyId"=${context.companyId}
        AND g."membershipId"=${membership.id}
        AND g."revokedAt" IS NULL
        AND g."startsAt"<=CURRENT_TIMESTAMP
        AND g."endsAt">CURRENT_TIMESTAMP
        AND (g."branchId" IS NULL OR g."branchId"=${context.branchId})
        AND p.resource=${required.requiredResource}
        AND p.action=${required.requiredAction}
      LIMIT 1
    `;
    return temporary.length > 0;
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
