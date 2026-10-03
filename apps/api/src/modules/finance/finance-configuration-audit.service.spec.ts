import { FinanceConfigurationAuditService } from './finance-configuration-audit.service';

describe('FinanceConfigurationAuditService', () => {
  it('scopes audit reads to the current tenant and company', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      financeConfigurationAuditEvent: { findMany },
    } as never;
    const tenantContext = {
      getTenantId: () => 'tenant-1',
      getCompanyId: () => 'company-1',
    } as never;

    const service = new FinanceConfigurationAuditService(prisma, tenantContext);
    await service.list({ limit: 25, entityType: 'expense_categories', operation: 'UPDATE' });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        OR: [{ companyId: 'company-1' }, { companyId: null }],
        entityType: 'expense_categories',
        operation: 'UPDATE',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 25,
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
  });

  it('caps audit read size at 500 records', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      financeConfigurationAuditEvent: { findMany },
    } as never;
    const tenantContext = {
      getTenantId: () => 'tenant-1',
      getCompanyId: () => 'company-1',
    } as never;

    const service = new FinanceConfigurationAuditService(prisma, tenantContext);
    await service.list({ limit: 5000 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });
});
