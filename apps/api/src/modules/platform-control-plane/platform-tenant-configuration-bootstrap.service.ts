import { ConflictException, Injectable } from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

@Injectable()
export class PlatformTenantConfigurationBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async ensureDefaults(
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
        SELECT pg_advisory_xact_lock(
          hashtext('tenant-configuration-bootstrap'),
          hashtext(${tenantId})
        )
      `;

      const company = await tx.company.findFirst({
        where: { tenantId, slug: options.companySlug },
        select: { id: true },
      });
      if (!company) {
        throw new ConflictException(
          'Primary company must exist before configuration bootstrap.',
        );
      }

      await tx.$executeRaw`
        INSERT INTO company_security_policies (
          "companyId",
          "requireMfa",
          "sessionMaxAgeMinutes",
          "idleTimeoutMinutes",
          "passwordMinLength",
          "updatedByUserId",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${company.id},
          FALSE,
          10080,
          480,
          8,
          NULL,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("companyId") DO NOTHING
      `;

      const policies = await tx.$queryRaw<
        Array<{
          companyId: string;
          requireMfa: boolean;
          sessionMaxAgeMinutes: number;
          idleTimeoutMinutes: number;
          passwordMinLength: number;
        }>
      >`
        SELECT
          "companyId" AS "companyId",
          "requireMfa" AS "requireMfa",
          "sessionMaxAgeMinutes" AS "sessionMaxAgeMinutes",
          "idleTimeoutMinutes" AS "idleTimeoutMinutes",
          "passwordMinLength" AS "passwordMinLength"
        FROM company_security_policies
        WHERE "companyId" = ${company.id}
        LIMIT 1
      `;
      const securityPolicy = policies[0];
      if (!securityPolicy) {
        throw new ConflictException('Company security policy bootstrap failed.');
      }

      const output = {
        companyId: company.id,
        securityPolicy,
        businessPolicyBootstrap: 'DEFERRED_UNTIL_TENANT_OWNER_AVAILABLE',
        notificationPolicyBootstrap: 'DEFERRED_UNTIL_TENANT_OWNER_AVAILABLE',
      };

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'provisioning',
          action: 'tenant.configuration.bootstrap',
          targetTenantId: tenantId,
          targetEntityType: 'company_security_policy',
          targetEntityId: company.id,
          reason: options.reason ?? null,
          afterState: output,
          correlationId: options.correlationId ?? null,
        },
        tx,
      );

      return output;
    };

    if (client) return execute(client);
    return this.prisma.$transaction(execute);
  }
}
