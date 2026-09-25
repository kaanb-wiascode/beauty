import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface AuditListInput {
  entityId?: string;
  action?: string;
  outcome?: 'SUCCESS' | 'FAILED';
  limit?: number;
}

@Injectable()
export class FinancialIntegrationAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(input: AuditListInput = {}) {
    const ctx = this.tenant.getContext();
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe(
      `SELECT id,action,resource,entity_id AS "entityId",outcome,route,method,error_message AS "errorMessage",
              actor_user_id AS "actorUserId",actor_role_id AS "actorRoleId",created_at AS "createdAt"
       FROM finance_integration_audit_logs
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
         AND ($4::text IS NULL OR entity_id=$4::text)
         AND ($5::text IS NULL OR action=$5::text)
         AND ($6::text IS NULL OR outcome=$6::text)
       ORDER BY created_at DESC
       LIMIT $7::int`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      input.entityId ?? null,
      input.action ?? null,
      input.outcome ?? null,
      limit,
    );
  }
}
