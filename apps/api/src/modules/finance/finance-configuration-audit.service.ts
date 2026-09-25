import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface FinanceConfigurationAuditQuery {
  limit?: number;
  entityType?: string;
  operation?: 'CREATE' | 'UPDATE' | 'DELETE';
}

@Injectable()
export class FinanceConfigurationAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(query: FinanceConfigurationAuditQuery = {}) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);

    return this.prisma.financeConfigurationAuditEvent.findMany({
      where: {
        tenantId,
        OR: [{ companyId }, { companyId: null }],
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.operation ? { operation: query.operation } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        operation: true,
        actorId: true,
        beforeState: true,
        afterState: true,
        createdAt: true,
        companyId: true,
      },
    });
  }
}
