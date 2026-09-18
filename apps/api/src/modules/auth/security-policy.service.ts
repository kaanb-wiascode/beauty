import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

@Injectable()
export class SecurityPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async get(tenantId: string, companyId: string) {
    await this.requireCompany(tenantId, companyId);
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "companyId", "requireMfa", "sessionMaxAgeMinutes", "idleTimeoutMinutes",
             "passwordMinLength", "updatedByUserId", "createdAt", "updatedAt"
      FROM company_security_policies
      WHERE "companyId" = ${companyId}
      LIMIT 1
    `;
    return rows[0] ?? {
      companyId,
      requireMfa: false,
      sessionMaxAgeMinutes: 10080,
      idleTimeoutMinutes: 480,
      passwordMinLength: 8,
      updatedByUserId: null,
    };
  }

  async update(
    input: {
      requireMfa: boolean;
      sessionMaxAgeMinutes: number;
      idleTimeoutMinutes: number;
      passwordMinLength: number;
    },
    context: { tenantId: string; companyId: string; actorUserId: string },
  ) {
    await this.requireCompany(context.tenantId, context.companyId);
    if (input.idleTimeoutMinutes > input.sessionMaxAgeMinutes) {
      throw new BadRequestException('Idle timeout cannot exceed session max age');
    }

    const before = await this.get(context.tenantId, context.companyId);
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      INSERT INTO company_security_policies (
        "companyId", "requireMfa", "sessionMaxAgeMinutes", "idleTimeoutMinutes",
        "passwordMinLength", "updatedByUserId", "createdAt", "updatedAt"
      ) VALUES (
        ${context.companyId}, ${input.requireMfa}, ${input.sessionMaxAgeMinutes},
        ${input.idleTimeoutMinutes}, ${input.passwordMinLength}, ${context.actorUserId},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("companyId") DO UPDATE SET
        "requireMfa" = EXCLUDED."requireMfa",
        "sessionMaxAgeMinutes" = EXCLUDED."sessionMaxAgeMinutes",
        "idleTimeoutMinutes" = EXCLUDED."idleTimeoutMinutes",
        "passwordMinLength" = EXCLUDED."passwordMinLength",
        "updatedByUserId" = EXCLUDED."updatedByUserId",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "companyId", "requireMfa", "sessionMaxAgeMinutes", "idleTimeoutMinutes",
                "passwordMinLength", "updatedByUserId", "createdAt", "updatedAt"
    `;
    const after = rows[0];

    await this.audit.record({
      actorUserId: context.actorUserId,
      resource: 'security_policy',
      action: 'update',
      targetTenantId: context.tenantId,
      targetEntityType: 'company_security_policy',
      targetEntityId: context.companyId,
      beforeState: before,
      afterState: after,
      metadata: { companyId: context.companyId },
    });

    return after;
  }

  private async requireCompany(tenantId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true },
    });
    if (!company) throw new BadRequestException('Company context is invalid');
  }
}
