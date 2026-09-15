import { ConflictException, Injectable } from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

@Injectable()
export class PlatformTenantBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async ensureDefaultRbac(
    tenantId: string,
    actorUserId: string,
    options: {
      companySlug: string;
      reason?: string | null;
      correlationId?: string | null;
    },
    client?: Prisma.TransactionClient,
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('tenant-rbac-bootstrap'), hashtext(${tenantId}))
      `;

      const company = await tx.company.findFirst({
        where: { tenantId, slug: options.companySlug },
        select: { id: true },
      });
      if (!company) throw new ConflictException('Primary company must exist before RBAC bootstrap.');

      const ownerRole = await tx.role.upsert({
        where: { tenantId_slug: { tenantId, slug: 'owner' } },
        update: {
          companyId: company.id,
          name: 'Owner',
          description: 'Full access to the tenant organization.',
          scope: 'CENTRAL',
        },
        create: {
          tenantId,
          companyId: company.id,
          name: 'Owner',
          slug: 'owner',
          description: 'Full access to the tenant organization.',
          scope: 'CENTRAL',
        },
        select: { id: true, slug: true, scope: true, companyId: true },
      });

      const permissions = await tx.permission.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: ownerRole.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      const assignedCount = await tx.rolePermission.count({
        where: { roleId: ownerRole.id },
      });

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'provisioning',
          action: 'tenant.rbac.bootstrap',
          targetTenantId: tenantId,
          targetEntityType: 'role',
          targetEntityId: ownerRole.id,
          reason: options.reason ?? null,
          afterState: {
            roleSlug: ownerRole.slug,
            roleScope: ownerRole.scope,
            companyId: ownerRole.companyId,
            permissionCount: assignedCount,
          },
          correlationId: options.correlationId ?? null,
        },
        tx,
      );

      return {
        ownerRoleId: ownerRole.id,
        permissionCount: assignedCount,
      };
    };

    if (client) return execute(client);
    return this.prisma.$transaction(execute);
  }
}
